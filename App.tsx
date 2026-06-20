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

import { NAS, PING_HOSTS } from './src/config';
import { openTailscale } from './src/tailscale';
import { usePlug } from './src/usePlug';
import { useReachability, type Reach } from './src/useReachability';
import { useHistory } from './src/useHistory';
import { totals, formatValue } from './src/aggregate';
import { EnergyModal } from './src/EnergyModal';
import { useAppLock } from './src/useAppLock';
import { LockScreen } from './src/LockScreen';

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
  const { nas, connected, state, pveEnergy, nasEnergy, pending, toggle, reconnect } = usePlug();
  const reach = useReachability();
  const vmUp = reach[PING_HOSTS[1].key] === 'up';

  const offline = nas === 'down';
  const ready = connected && state !== null;
  const isOn = state === 'on';

  const { data, averageBootSeconds, bootStartedAt, addPrice, removePrice, setCurrency } = useHistory(
    { pveEnergy, nasEnergy, state, vmUp },
  );
  const totalCost = totals(data, 'cost').sum;

  // "Booting" only after an actual off->on this session — bootStartedAt is set on
  // the power-on press, not on a transient VM/Tailscale drop while already on.
  const booting = ready && isOn && !vmUp && bootStartedAt != null;

  const [modalVisible, setModalVisible] = useState(false);

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

  const ringColor = !ready ? COL.muted : booting ? COL.booting : isOn ? COL.on : COL.off;
  const showSpinner = !offline && !booting && (!ready || pending);

  const stateWord = offline
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

  const tapHint =
    ready && !pending ? (isOn ? 'Tap to turn off' : 'Tap to turn on') : ' ';

  const onToggle = () => {
    if (!ready || pending) return;
    Haptics.selectionAsync();
    toggle();
  };

  const onRetry = () => {
    Haptics.selectionAsync();
    reconnect();
  };

  const onOpenEnergy = () => {
    Haptics.selectionAsync();
    setModalVisible(true);
  };

  const rows = [
    { label: NAS.label, host: NAS.host, reach: nas, depth: 0 },
    { label: PING_HOSTS[0].label, host: PING_HOSTS[0].host, reach: reach[PING_HOSTS[0].key], depth: 1 },
    { label: PING_HOSTS[1].label, host: PING_HOSTS[1].host, reach: reach[PING_HOSTS[1].key], depth: 2 },
  ];

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
          disabled={!ready || pending}
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
        {rows.map((row) => (
          <StatusRow
            key={row.label}
            label={row.label}
            host={row.host}
            reach={row.reach}
            depth={row.depth}
          />
        ))}
      </View>

      <EnergyModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        data={data}
        addPrice={addPrice}
        removePrice={removePrice}
        setCurrency={setCurrency}
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

function StatusRow({
  label,
  host,
  reach,
  depth,
}: {
  label: string;
  host: string;
  reach: Reach;
  depth: number;
}) {
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
      <View style={styles.statusText}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusIp}>{host}</Text>
      </View>
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
  statusText: {
    flex: 1,
  },
  statusLabel: {
    color: COL.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  statusIp: {
    color: COL.textTertiary,
    fontSize: 12,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  statusWord: {
    fontSize: 13,
    fontWeight: '500',
  },
});
