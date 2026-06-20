import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

import { BROKER_PORT, SERVERS } from './src/config';
import { openTailscale } from './src/tailscale';
import { usePlug } from './src/usePlug';
import { useReachability, type Reach } from './src/useReachability';
import { useStore } from './src/useStore';
import { useRecorder } from './src/useRecorder';
import { totals, formatValue } from './src/aggregate';
import { EnergyModal } from './src/EnergyModal';
import { ServerModal } from './src/ServerModal';
import { useAppLock } from './src/useAppLock';
import { LockScreen } from './src/LockScreen';
import { useShutdown } from './src/useShutdown';

const COL = {
  bgTop: '#10131a',
  bgBottom: '#0b0d12',
  textPrimary: '#e7e9ee',
  textSecondary: '#9aa3b2',
  textTertiary: '#5b6472',
  card: 'rgba(255,255,255,0.035)',
  border: 'rgba(255,255,255,0.08)',
  on: '#34d399',
  off: '#5c6675',
  muted: '#39414f',
  booting: '#fbbf24',
  up: '#34d399',
  down: '#f87171',
  checking: '#fbbf24',
};

const TOGGLE_SIZE = 200;

export default function App() {
  const { unlocked, authenticate } = useAppLock();
  const store = useStore(unlocked);
  const data = store.data;

  const { nas, connected, state, pveEnergy, nasEnergy, pending, setPower, reconnect } = usePlug({
    hosts: data.servers.nas,
    port: BROKER_PORT,
  });
  const reach = useReachability(data.servers);
  const vmUp = reach.vm === 'up';

  const offline = nas === 'down';
  const ready = connected && state !== null;
  const isOn = state === 'on';

  const shutdown = useShutdown({
    pveReach: reach.pve,
    pveHosts: data.servers.pve,
    ssh: data.ssh,
    powerOff: () => setPower(false),
  });
  const sshConfigured = data.ssh.password.trim().length > 0;
  const shuttingDown = shutdown.phase === 'sending' || shutdown.phase === 'waiting';
  const shutdownFailed = shutdown.phase === 'error';
  const shutdownActive = shuttingDown || shutdownFailed;

  const { averageBootSeconds, bootStartedAt } = useRecorder(store, {
    pveEnergy,
    nasEnergy,
    state,
    vmUp,
  });
  const totalCost = totals(data, 'cost').sum;

  // "Booting" only after an actual off->on this session — bootStartedAt is set on
  // the power-on press, not on a transient VM/Tailscale drop while already on.
  const booting = ready && isOn && !vmUp && bootStartedAt != null;

  const [modalVisible, setModalVisible] = useState(false);
  const [serverModalVisible, setServerModalVisible] = useState(false);

  const avgMs = averageBootSeconds != null ? averageBootSeconds * 1000 : null;

  // The ring fills smoothly via the native Animated API (animates one prop, no
  // per-frame React re-renders). Full ring when there's no average yet.
  const ringProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    ringProgress.stopAnimation();
    if (!booting) return;
    if (avgMs == null) {
      ringProgress.setValue(1);
      return;
    }
    const elapsed = bootStartedAt != null ? Math.max(0, Date.now() - bootStartedAt) : 0;
    const start = Math.min(1, elapsed / avgMs);
    ringProgress.setValue(start);
    const remaining = avgMs - elapsed;
    if (remaining > 0 && start < 1) {
      Animated.timing(ringProgress, {
        toValue: 1,
        duration: remaining,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    }
  }, [booting, bootStartedAt, avgMs, ringProgress]);

  // Once-per-second tick for the countdown text only.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!booting) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [booting]);

  const bootElapsed = bootStartedAt != null ? Math.max(0, nowMs - bootStartedAt) : 0;
  const remainingSec = avgMs ? Math.max(0, Math.ceil((avgMs - bootElapsed) / 1000)) : null;
  const countdown = remainingSec != null ? formatCountdown(remainingSec) : null;

  const ringColor = shutdownFailed
    ? COL.down
    : shuttingDown
      ? COL.booting
      : !ready
        ? COL.muted
        : booting
          ? COL.booting
          : isOn
            ? COL.on
            : COL.off;
  const showSpinner =
    shuttingDown || (!offline && !shutdownActive && !booting && (!ready || pending));

  const stateWord = shutdownFailed
    ? 'Shutdown failed'
    : shuttingDown
      ? 'Shutting down…'
      : offline
        ? 'Offline'
        : !connected
          ? 'Connecting'
          : state === null
            ? 'Reading state'
            : pending
              ? 'Switching'
              : booting
                ? 'Booting…'
                : isOn
                  ? 'Server on'
                  : 'Server off';

  const tapHint = shuttingDown
    ? 'Cutting power once it’s down'
    : shutdownFailed
      ? (shutdown.error ?? 'SSH failed')
      : ready && !pending
        ? isOn
          ? 'Tap to turn off'
          : 'Tap to turn on'
        : ' ';

  const onToggle = () => {
    if (shutdownActive || !ready || pending) return;
    Haptics.selectionAsync();
    if (isOn) {
      if (sshConfigured) void shutdown.start();
      else setPower(false);
    } else {
      setPower(true);
    }
  };

  const onForceOff = () => {
    Haptics.selectionAsync();
    shutdown.forceOff();
  };

  const onRetry = () => {
    Haptics.selectionAsync();
    reconnect();
  };

  const onOpenEnergy = () => {
    Haptics.selectionAsync();
    setModalVisible(true);
  };

  const onOpenServers = () => {
    Haptics.selectionAsync();
    setServerModalVisible(true);
  };

  const reachByKey: Record<string, Reach> = { nas, pve: reach.pve, vm: reach.vm };
  const rows = SERVERS.map((s, i) => ({
    key: s.key,
    label: s.label,
    reach: reachByKey[s.key],
    depth: i,
  }));

  if (!unlocked) {
    return <LockScreen onUnlock={authenticate} />;
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={[COL.bgTop, COL.bgBottom]} style={StyleSheet.absoluteFill} />
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.title}>pveSwitch</Text>
        <Text style={styles.subtitle}>Server power</Text>
      </View>

      <View style={styles.center}>
        <Pressable
          onPress={onToggle}
          disabled={shutdownActive || !ready || pending}
          style={({ pressed }) => [
            styles.toggle,
            {
              borderColor: booting ? 'transparent' : withAlpha(ringColor, 0.55),
              backgroundColor: withAlpha(ringColor, 0.07),
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          {booting && <BootRing size={TOGGLE_SIZE} stroke={5} progress={ringProgress} color={COL.booting} />}
          {booting ? (
            countdown ? (
              <Text style={styles.countdown}>{countdown}</Text>
            ) : (
              <Feather name="power" size={64} color={COL.booting} />
            )
          ) : showSpinner ? (
            <ActivityIndicator color={ringColor} size="large" />
          ) : (
            <Feather name="power" size={66} color={ringColor} />
          )}
        </Pressable>

        <Text style={styles.stateWord}>{stateWord}</Text>
        <Text style={styles.tapHint}>{tapHint}</Text>

        {shutdownActive ? (
          <Pressable
            onPress={onForceOff}
            style={({ pressed }) => [styles.forceOff, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Feather name="power" size={15} color="#0b0d12" />
            <Text style={styles.forceOffText}>Force power off</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={onOpenEnergy}
              style={({ pressed }) => [styles.energy, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="bar-chart-2" size={13} color={COL.textTertiary} />
              <Text style={styles.energyText}>{formatValue(totalCost, 'cost', data.currency)}</Text>
              <Feather name="chevron-right" size={14} color={COL.textTertiary} />
            </Pressable>

            {offline && (
              <Pressable
                onPress={onRetry}
                style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="refresh-cw" size={14} color={COL.textPrimary} />
                <Text style={styles.retryText}>Retry connecting</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      <View style={styles.statusCard}>
        {nas === 'down' && (
          <Pressable
            style={({ pressed }) => [styles.hint, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => {
              Haptics.selectionAsync();
              void openTailscale();
            }}
          >
            <Feather name="alert-triangle" size={13} color={COL.checking} />
            <Text style={styles.hintText}>
              Can&rsquo;t reach your network —{' '}
              <Text style={styles.hintLink}>Click here to open Tailscale</Text>
            </Text>
            <Feather name="external-link" size={12} color={COL.checking} />
          </Pressable>
        )}
        <Pressable onPress={onOpenServers} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          {rows.map((row) => (
            <StatusRow key={row.key} label={row.label} reach={row.reach} depth={row.depth} />
          ))}
          <View style={styles.editHint}>
            <Feather name="edit-2" size={11} color={COL.textTertiary} />
            <Text style={styles.editHintText}>Edit server IPs</Text>
          </View>
        </Pressable>
      </View>

      <EnergyModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        data={data}
        addPrice={store.addPrice}
        removePrice={store.removePrice}
        setCurrency={store.setCurrency}
      />

      <ServerModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
        servers={data.servers}
        ssh={data.ssh}
        onSave={(servers, ssh) => store.commit({ ...store.getData(), servers, ssh })}
      />
    </View>
  );
}

function BootRing({
  size,
  stroke,
  progress,
  color,
}: {
  size: number;
  stroke: number;
  progress: Animated.Value;
  color: string;
}) {
  const center = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={center} cy={center} r={r} stroke={withAlpha(color, 0.18)} strokeWidth={stroke} fill="none" />
      <AnimatedCircle
        cx={center}
        cy={center}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
    </Svg>
  );
}

function StatusRow({ label, reach, depth }: { label: string; reach: Reach; depth: number }) {
  const color = reach === 'up' ? COL.up : reach === 'down' ? COL.down : COL.checking;
  const word = reach === 'up' ? 'online' : reach === 'down' ? 'offline' : 'checking';

  return (
    <View style={[styles.statusRow, { paddingLeft: depth * 18 }]}>
      {depth > 0 && (
        <Feather
          name="corner-down-right"
          size={14}
          color={COL.textTertiary}
          style={styles.branch}
        />
      )}
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={styles.spacer} />
      <Text style={[styles.statusWord, { color }]}>{word}</Text>
    </View>
  );
}

/** "1:05" for >= 60s, otherwise "42s". */
function formatCountdown(totalSec: number): string {
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${totalSec}s`;
}

/** Apply an alpha channel to a #rrggbb hex color. */
function withAlpha(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COL.bgBottom,
    paddingHorizontal: 26,
    paddingTop: 76,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    gap: 4,
  },
  title: {
    color: COL.textPrimary,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: COL.textTertiary,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  center: {
    alignItems: 'center',
  },
  toggle: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: TOGGLE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    color: COL.booting,
    fontSize: 38,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stateWord: {
    color: COL.textPrimary,
    fontSize: 19,
    fontWeight: '600',
    marginTop: 28,
  },
  tapHint: {
    color: COL.textSecondary,
    fontSize: 14,
    marginTop: 5,
  },
  energy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COL.border,
    backgroundColor: COL.card,
  },
  energyText: {
    color: COL.textSecondary,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(154,163,178,0.3)',
    backgroundColor: COL.card,
  },
  retryText: {
    color: COL.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  forceOff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: COL.down,
  },
  forceOffText: {
    color: '#0b0d12',
    fontSize: 14,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: COL.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COL.border,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  hintText: {
    color: COL.checking,
    fontSize: 13,
    flex: 1,
  },
  hintLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  branch: {
    marginRight: 6,
    opacity: 0.7,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 12,
  },
  statusLabel: {
    color: COL.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  spacer: {
    flex: 1,
  },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 8,
    paddingBottom: 2,
  },
  editHintText: {
    color: COL.textTertiary,
    fontSize: 11,
  },
  statusWord: {
    fontSize: 13,
    fontWeight: '500',
  },
});
