/**
 * A themed calendar popup for picking a date, with an "open-ended" shortcut
 * (Beginning / Current) that returns null. Rendered as an absolute overlay so
 * it sits on top of the energy modal without a nested native Modal.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

export function DatePicker({
  value,
  openEndedLabel,
  onSelect,
  onClose,
}: {
  value: string | null;
  openEndedLabel: string;
  onSelect: (v: string | null) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const init = value ? new Date(value) : today;
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstWeekday = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday-based
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const step = (dir: number) => {
    let m = view.m + dir;
    let y = view.y;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setView({ y, m });
  };

  const todayKey = keyOf(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.card}>
        <View style={styles.header}>
          <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.nav}>
            <Feather name="chevron-left" size={20} color={C.textSecondary} />
          </Pressable>
          <Text style={styles.month}>
            {MONTHS[view.m]} {view.y}
          </Text>
          <Pressable onPress={() => step(1)} hitSlop={10} style={styles.nav}>
            <Feather name="chevron-right" size={20} color={C.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={styles.weekday}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (d === null) return <View key={`b${i}`} style={styles.cell} />;
            const key = keyOf(view.y, view.m, d);
            const selected = key === value;
            const isToday = key === todayKey;
            return (
              <Pressable key={key} style={styles.cell} onPress={() => onSelect(key)}>
                <View
                  style={[
                    styles.day,
                    selected && styles.daySelected,
                    !selected && isToday && styles.dayToday,
                  ]}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{d}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.footBtn} onPress={() => onSelect(todayKey)}>
            <Text style={styles.footText}>Today</Text>
          </Pressable>
          <Pressable style={[styles.footBtn, styles.footBtnAccent]} onPress={() => onSelect(null)}>
            <Text style={[styles.footText, styles.footTextAccent]}>{openEndedLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const C = {
  card: '#12151c',
  border: 'rgba(255,255,255,0.08)',
  textPrimary: '#e7e9ee',
  textSecondary: '#9aa3b2',
  textTertiary: '#5b6472',
  accent: '#34d399',
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 330,
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  nav: {
    padding: 4,
  },
  month: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: C.textTertiary,
    fontSize: 12,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: C.accent,
  },
  dayToday: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  dayText: {
    color: C.textPrimary,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  dayTextSelected: {
    color: '#0b0d12',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  footBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  footBtnAccent: {
    backgroundColor: 'rgba(52,211,153,0.14)',
  },
  footText: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  footTextAccent: {
    color: C.accent,
  },
});
