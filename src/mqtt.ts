/**
 * Minimal persistent MQTT 3.1.1 client over a raw TCP socket.
 *
 * Hand-rolls the few control packets we need (CONNECT, SUBSCRIBE, PUBLISH at
 * QoS 0, PINGREQ, DISCONNECT) and parses the broker's stream (CONNACK, SUBACK,
 * PUBLISH, PINGRESP) so the app can both send commands and receive the plug's
 * live state + energy. Reconnects automatically if the connection drops.
 */
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';

type Socket = ReturnType<typeof TcpSocket.createConnection>;

export interface MqttOptions {
  host: string;
  port: number;
  keepAliveSeconds?: number;
}

export interface MqttHandlers {
  onConnect?: () => void;
  onMessage?: (topic: string, payload: Buffer) => void;
  onDisconnect?: () => void;
}

/** Encode an MQTT "remaining length" (variable-length integer). */
function encodeRemainingLength(length: number): Buffer {
  const out: number[] = [];
  let len = length;
  do {
    let byte = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) byte |= 0x80;
    out.push(byte);
  } while (len > 0);
  return Buffer.from(out);
}

/** Encode a UTF-8 string with the MQTT 2-byte big-endian length prefix. */
function encodeString(value: string): Buffer {
  const body = Buffer.from(value, 'utf8');
  const header = Buffer.alloc(2);
  header.writeUInt16BE(body.length, 0);
  return Buffer.concat([header, body]);
}

const PINGREQ = Buffer.from([0xc0, 0x00]);
const DISCONNECT = Buffer.from([0xe0, 0x00]);
const RECONNECT_DELAY_MS = 3000;
// Overall connect+handshake timeout, armed immediately when a connect starts.
// A hung TCP connect (e.g. dialing a Tailscale IP whose route isn't up yet) emits
// no error and never fires the connect callback, so without this the reconnect
// loop stalls forever and only an app restart recovers. 10s leaves room for a
// slow cold Tailscale dial while still keeping the loop alive.
const CONNECT_TIMEOUT_MS = 10000;

export class MqttClient {
  private socket?: Socket;
  private buffer = Buffer.alloc(0);
  private packetId = 0;
  private connected = false;
  private closedByUser = false;
  private pingTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly options: MqttOptions,
    private readonly handlers: MqttHandlers,
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.teardownSocket();
    this.stopConnectTimer();
    this.buffer = Buffer.alloc(0);

    const clientId = `pveswitch-${Math.random().toString(16).slice(2, 10)}`;
    try {
      const socket = TcpSocket.createConnection(
        { host: this.options.host, port: this.options.port },
        () => socket.write(this.buildConnect(clientId)),
      );
      this.socket = socket;
      socket.on('data', (data: unknown) => this.onData(data as Buffer | string));
      socket.on('error', () => this.handleDrop());
      socket.on('close', () => this.handleDrop());
    } catch {
      // createConnection can throw synchronously when the network is down.
      this.scheduleReconnect();
      return;
    }

    // Abort & retry if the connect/handshake hasn't completed in time. Armed now
    // (not after TCP connects) so a HUNG connect is still retried — otherwise the
    // app stays "offline" until a full restart when Tailscale comes up late.
    this.connectTimer = setTimeout(() => {
      if (!this.connected) this.handleDrop();
    }, CONNECT_TIMEOUT_MS);
  }

  disconnect(): void {
    this.closedByUser = true;
    this.stopTimers();
    if (this.socket) {
      try {
        this.socket.write(DISCONNECT);
      } catch {
        // ignore
      }
    }
    this.teardownSocket();
    this.connected = false;
  }

  /** Force a fresh connection attempt now (used by the manual retry button). */
  reconnect(): void {
    this.stopTimers();
    this.teardownSocket();
    this.connected = false;
    this.connect();
  }

  publish(topic: string, message: string): boolean {
    if (!this.socket || !this.connected) return false;
    try {
      this.socket.write(this.buildPublish(topic, message));
      return true;
    } catch {
      return false;
    }
  }

  subscribe(topic: string): void {
    if (!this.socket || !this.connected) return;
    try {
      this.socket.write(this.buildSubscribe(topic));
    } catch {
      // ignore
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --- internals ---

  private handleDrop(): void {
    if (!this.socket) return; // already handled
    const wasConnected = this.connected;
    this.connected = false;
    this.stopConnectTimer();
    this.teardownSocket();
    this.stopPing();
    if (wasConnected) this.handlers.onDisconnect?.();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private teardownSocket(): void {
    if (this.socket) {
      try {
        (this.socket as unknown as { removeAllListeners?: () => void }).removeAllListeners?.();
      } catch {
        // ignore
      }
      try {
        this.socket.destroy();
      } catch {
        // ignore
      }
      this.socket = undefined;
    }
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private stopConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
    }
  }

  private stopTimers(): void {
    this.stopPing();
    this.stopConnectTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private startPing(): void {
    this.stopPing();
    const seconds = Math.max(10, (this.options.keepAliveSeconds ?? 60) * 0.75);
    this.pingTimer = setInterval(() => {
      try {
        this.socket?.write(PINGREQ);
      } catch {
        // ignore
      }
    }, seconds * 1000);
  }

  private onData(data: Buffer | string): void {
    const chunk: Buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // A TCP read may contain partial or multiple packets; drain whole ones.
    while (this.buffer.length >= 2) {
      let multiplier = 1;
      let remaining = 0;
      let pos = 1;
      let byte = 0;
      let lengthComplete = false;
      do {
        if (pos >= this.buffer.length) break;
        byte = this.buffer[pos];
        remaining += (byte & 0x7f) * multiplier;
        multiplier *= 128;
        pos += 1;
        if ((byte & 0x80) === 0) lengthComplete = true;
      } while ((byte & 0x80) !== 0);

      if (!lengthComplete) break; // remaining-length field not fully received
      const total = pos + remaining;
      if (this.buffer.length < total) break; // body not fully received

      const header = this.buffer[0];
      const body = Buffer.from(this.buffer.subarray(pos, total));
      this.handlePacket(header, body);
      this.buffer = Buffer.from(this.buffer.subarray(total));
    }
  }

  private handlePacket(header: number, body: Buffer): void {
    const type = header & 0xf0;
    if (type === 0x20) {
      // CONNACK: body = [ackFlags, returnCode]
      if (body.length >= 2 && body[1] === 0) {
        this.connected = true;
        this.stopConnectTimer();
        this.startPing();
        this.handlers.onConnect?.();
      } else {
        this.handleDrop();
      }
    } else if (type === 0x30) {
      // PUBLISH from broker
      if (body.length < 2) return;
      const qos = (header & 0x06) >> 1;
      const topicLen = body.readUInt16BE(0);
      let idx = 2 + topicLen;
      const topic = Buffer.from(body.subarray(2, idx)).toString('utf8');
      if (qos > 0) idx += 2; // skip packet identifier
      const payload = Buffer.from(body.subarray(idx));
      this.handlers.onMessage?.(topic, payload);
    }
    // SUBACK (0x90) and PINGRESP (0xd0): nothing to do.
  }

  private nextPacketId(): number {
    this.packetId = (this.packetId % 65535) + 1;
    return this.packetId;
  }

  private buildConnect(clientId: string): Buffer {
    const keepAlive = Buffer.alloc(2);
    keepAlive.writeUInt16BE(this.options.keepAliveSeconds ?? 60, 0);
    const body = Buffer.concat([
      encodeString('MQTT'),
      Buffer.from([0x04]), // protocol level 4 (MQTT 3.1.1)
      Buffer.from([0x02]), // clean session
      keepAlive,
      encodeString(clientId),
    ]);
    return Buffer.concat([Buffer.from([0x10]), encodeRemainingLength(body.length), body]);
  }

  private buildPublish(topic: string, message: string): Buffer {
    const body = Buffer.concat([encodeString(topic), Buffer.from(message, 'utf8')]);
    return Buffer.concat([Buffer.from([0x30]), encodeRemainingLength(body.length), body]);
  }

  private buildSubscribe(topic: string): Buffer {
    const idHeader = Buffer.alloc(2);
    idHeader.writeUInt16BE(this.nextPacketId(), 0);
    const body = Buffer.concat([
      idHeader,
      encodeString(topic),
      Buffer.from([0x00]), // requested QoS 0
    ]);
    // 0x82 = SUBSCRIBE with required reserved flags
    return Buffer.concat([Buffer.from([0x82]), encodeRemainingLength(body.length), body]);
  }
}
