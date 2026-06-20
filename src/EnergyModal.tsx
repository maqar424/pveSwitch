import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { LineChart, Segmented, StackedBarChart } from './charts';
import { DatePicker } from './DatePicker';
import {
  buildBuckets,
  formatNumber,
  formatValue,
  priceAt,
  SERIES,
  totals,
  type Duration,
  type Metric,
} from './aggregate';
import { dayKey, type PveData } from './storage';

type Viz = 'line' | 'bar';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function EnergyModal({
  visible,
  onClose,
  data,
  addPrice,
  removePrice,
  setCurrency,
}: {
  visible: boolean;
  onClose: () => void;
  data: PveData;
  addPrice: (start: string | null, end: string | null, price: number) => void;
  removePrice: (id: string) => void;
  setCurrency: (currency: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>('cost');
  const [duration, setDuration] = useState<Duration>('total');
  const [viz, setViz] = useState<Viz>('line');

  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<'start' | 'end' | null>(null);

  const now = new Date();
  const prefix =
    duration === 'total'
      ? undefined
      : duration === 'year'
        ? String(now.getFullYear())
        : `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;

  const buckets = buildBuckets(data, duration, metric, now);
  const t = totals(data, metric, prefix);
  const currency = data.currency;
  const currentPrice = priceAt(data.prices, dayKey());

  const onAdd = () => {
    const p = parseFloat(priceInput.replace(',', '.'));
    if (!Number.isFinite(p) || p < 0) return;
    if (startDate && endDate && startDate > endDate) return; // invalid range
    addPrice(startDate, endDate, p);
    setPriceInput('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Energy</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Feather name="x" size={20} color={C.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Segmented
              options={[
                { key: 'cost', label: currency },
                { key: 'kwh', label: 'kWh' },
              ]}
              value={metric}
              onChange={setMetric}
            />
            <Segmented
              options={[
                { key: 'total', label: 'Total' },
                { key: 'year', label: 'Year' },
                { key: 'month', label: 'Month' },
              ]}
              value={duration}
              onChange={setDuration}
            />
            <Segmented
              options={[
                { key: 'line', label: 'Line' },
                { key: 'bar', label: 'Bar' },
              ]}
              value={viz}
              onChange={setViz}
            />

            <View style={styles.chartCard}>
              {buckets.length === 0 || t.sum === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No data yet</Text>
                </View>
              ) : viz === 'line' ? (
                <LineChart buckets={buckets} metric={metric} currency={currency} />
              ) : (
                <StackedBarChart buckets={buckets} metric={metric} currency={currency} />
              )}
            </View>

            <View style={styles.legend}>
              <LegendItem color={SERIES.nas} label="NAS" value={formatValue(t.nas, metric, currency)} />
              <LegendItem color={SERIES.pve} label="pve" value={formatValue(t.pve, metric, currency)} />
              <LegendItem color={SERIES.sum} label="Sum" value={formatValue(t.sum, metric, currency)} />
            </View>

            <View style={styles.divider} />

            {!editingPrice ? (
              <View style={styles.collapsedPrice}>
                <Text style={styles.collapsedText}>
                  {data.prices.length === 0
                    ? 'Price per kWh is not set'
                    : `Price per kWh is ${formatNumber(currentPrice)} ${currency}`}
                </Text>
                <Pressable onPress={() => setEditingPrice(true)} style={styles.editBtn} hitSlop={6}>
                  <Feather name="edit-2" size={13} color={C.textPrimary} />
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.priceHeader}>
                  <Text style={styles.sectionTitle}>Price per kWh</Text>
                  <Pressable onPress={() => setEditingPrice(false)} style={styles.hideBtn} hitSlop={6}>
                    <Feather name="chevron-down" size={16} color={C.textSecondary} />
                    <Text style={styles.hideText}>Hide</Text>
                  </Pressable>
                </View>

                <View style={styles.currencyRow}>
                  <Text style={styles.currencyLabel}>Currency</Text>
                  <TextInput
                    value={currency}
                    onChangeText={(v) => setCurrency(v.slice(0, 3) || '€')}
                    style={styles.currencyInput}
                    maxLength={3}
                    placeholderTextColor={C.textTertiary}
                  />
                </View>

                <View style={styles.dateRow}>
                  <DateField label="Start" display={startDate ?? 'Beginning'} onPress={() => setPickerMode('start')} />
                  <Feather name="arrow-right" size={16} color={C.textTertiary} />
                  <DateField label="End" display={endDate ?? 'Current'} onPress={() => setPickerMode('end')} />
                </View>

                <View style={styles.addRow}>
                  <TextInput
                    value={priceInput}
                    onChangeText={setPriceInput}
                    placeholder={`0,30 ${currency}`}
                    placeholderTextColor={C.textTertiary}
                    keyboardType="decimal-pad"
                    style={styles.priceInput}
                  />
                  <Pressable onPress={onAdd} style={styles.addBtn}>
                    <Feather name="plus" size={18} color="#0b0d12" />
                  </Pressable>
                </View>

                {data.prices.length === 0 ? (
                  <Text style={styles.noPrices}>No prices set — costs show as 0 until you add one.</Text>
                ) : (
                  [...data.prices]
                    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
                    .map((p) => (
                      <View key={p.id} style={styles.priceRow}>
                        <Text style={styles.priceFrom}>
                          {(p.start ?? 'Beginning') + ' → ' + (p.end ?? 'Current')}
                        </Text>
                        <Text style={styles.priceValue}>
                          {formatNumber(p.price)} {currency}
                        </Text>
                        <Pressable onPress={() => removePrice(p.id)} hitSlop={8}>
                          <Feather name="trash-2" size={16} color={C.textTertiary} />
                        </Pressable>
                      </View>
                    ))
                )}
              </>
            )}
          </ScrollView>
        </View>

        {pickerMode && (
          <DatePicker
            value={pickerMode === 'start' ? startDate : endDate}
            openEndedLabel={pickerMode === 'start' ? 'Beginning' : 'Current'}
            onSelect={(v) => {
              if (pickerMode === 'start') setStartDate(v);
              else setEndDate(v);
              setPickerMode(null);
            }}
            onClose={() => setPickerMode(null)}
          />
        )}
      </View>
    </Modal>
  );
}

function DateField({
  label,
  display,
  onPress,
}: {
  label: string;
  display: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.dateField} onPress={onPress}>
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.dateValueRow}>
        <Feather name="calendar" size={14} color={C.textSecondary} />
        <Text style={styles.dateValue}>{display}</Text>
      </View>
    </Pressable>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={styles.legendHead}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.legendLabel}>{label}</Text>
      </View>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

const C = {
  bg: '#0b0d12',
  card: '#12151c',
  surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  textPrimary: '#e7e9ee',
  textSecondary: '#9aa3b2',
  textTertiary: '#5b6472',
  accent: '#34d399',
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  card: {
    width: '100%',
    height: '90%',
    backgroundColor: C.bg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  title: {
    color: C.textPrimary,
    fontSize: 20,
    fontWeight: '600',
  },
  close: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 18,
    paddingBottom: 30,
    gap: 12,
  },
  chartCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  empty: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: C.textTertiary,
    fontSize: 14,
  },
  legend: {
    flexDirection: 'row',
    gap: 10,
  },
  legendItem: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  legendHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: C.textSecondary,
    fontSize: 12,
  },
  legendValue: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 6,
  },
  collapsedPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 2,
  },
  collapsedText: {
    flexShrink: 1,
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  editText: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  hideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hideText: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  currencyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyLabel: {
    color: C.textTertiary,
    fontSize: 12,
  },
  currencyInput: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 46,
    textAlign: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateField: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3,
  },
  dateLabel: {
    color: C.textTertiary,
    fontSize: 11,
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateValue: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.textPrimary,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontVariant: ['tabular-nums'],
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPrices: {
    color: C.textTertiary,
    fontSize: 13,
    paddingVertical: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  priceFrom: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  priceValue: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
