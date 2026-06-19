import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ENERGY_UNIT, NAS, PING_HOSTS } from './src/config';
import { usePlug } from './src/usePlug';
import { useReachability, type Reach } from './src/useReachability';

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

export default function App() {
  const { nas, connected, state, energy, pending, toggle } = usePlug();
  const reach = useReachability();

  const vmUp = reach[PING_HOSTS[1].key] === 'up';
  const ready = connected && state !== null;
  const isOn = state === 'on';
  const booting = ready && isOn && !vmUp; // plug on, VM not reachable yet

  // The big control is only "green / Server on" once the VM is actually up.
  const ringColor = !ready
    ? COL.muted
    : isOn
      ? vmUp
        ? COL.on
        : COL.booting
      : COL.off;

  const showSpinner = !ready || pending || booting;

  const stateWord = !connected
    ? 'Connecting'
    : state === null
      ? 'Reading state'
      : pending
        ? 'Switching'
        : isOn
          ? vmUp
            ? 'Server on'
            : 'Booting…'
          : 'Server off';

  const tapHint =
    ready && !pending ? (isOn ? 'Tap to turn off' : 'Tap to turn on') : ' ';

  const onToggle = () => {
    if (!ready || pending) return;
    Haptics.selectionAsync();
    toggle();
  };

  const rows = [
    { label: NAS.label, host: NAS.host, reach: nas, depth: 0 },
    { label: PING_HOSTS[0].label, host: PING_HOSTS[0].host, reach: reach[PING_HOSTS[0].key], depth: 1 },
    { label: PING_HOSTS[1].label, host: PING_HOSTS[1].host, reach: reach[PING_HOSTS[1].key], depth: 2 },
  ];

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
              borderColor: withAlpha(ringColor, 0.55),
              backgroundColor: withAlpha(ringColor, 0.07),
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          {showSpinner ? (
            <ActivityIndicator color={ringColor} size="large" />
          ) : (
            <Feather name="power" size={66} color={ringColor} />
          )}
        </Pressable>

        <Text style={styles.stateWord}>{stateWord}</Text>
        <Text style={styles.tapHint}>{tapHint}</Text>

        {energy !== null && (
          <View style={styles.energy}>
            <Feather name="zap" size={12} color={COL.textTertiary} />
            <Text style={styles.energyText}>
              {energy.toFixed(2)} {ENERGY_UNIT}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.statusCard}>
        {nas === 'down' && (
          <View style={styles.hint}>
            <Feather name="alert-triangle" size={13} color={COL.checking} />
            <Text style={styles.hintText}>Can&rsquo;t reach your network — turn on Tailscale.</Text>
          </View>
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
    </View>
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
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 5,
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
    flexShrink: 1,
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
