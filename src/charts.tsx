/**
 * Lightweight charts drawn directly with react-native-svg, plus a segmented
 * control. Resolution-independent via a fixed viewBox scaled to full width.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { SERIES, formatNumber, type Bucket, type Metric } from './aggregate';

const W = 320;
const H = 200;
const PAD = { l: 10, r: 10, t: 14, b: 26 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;
const bottom = H - PAD.b;

const GRID = 'rgba(255,255,255,0.08)';
const AXIS_TXT = '#5b6472';

function xLabelIndices(n: number, max = 5): Set<number> {
  if (n <= max) return new Set(Array.from({ length: n }, (_, i) => i));
  const step = Math.ceil(n / max);
  const out = new Set<number>();
  for (let i = 0; i < n; i += step) out.add(i);
  out.add(n - 1);
  return out;
}

function unit(metric: Metric, currency: string): string {
  return metric === 'cost' ? currency : 'kWh';
}

/** Cumulative line chart: running totals for nas, pve, and their sum. */
export function LineChart({
  buckets,
  metric,
  currency,
}: {
  buckets: Bucket[];
  metric: Metric;
  currency: string;
}) {
  const n = buckets.length;
  const nasCum: number[] = [];
  const pveCum: number[] = [];
  const sumCum: number[] = [];
  let an = 0;
  let ap = 0;
  for (const b of buckets) {
    an += b.nas;
    ap += b.pve;
    nasCum.push(an);
    pveCum.push(ap);
    sumCum.push(an + ap);
  }
  const max = Math.max(1, ...sumCum);
  const labels = xLabelIndices(n);

  const x = (i: number) => (n > 1 ? PAD.l + (i * plotW) / (n - 1) : PAD.l + plotW / 2);
  const y = (v: number) => bottom - (v / max) * plotH;
  const poly = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={bottom} stroke={GRID} strokeWidth={1} />
      <Line x1={PAD.l} y1={bottom} x2={W - PAD.r} y2={bottom} stroke={GRID} strokeWidth={1} />
      <SvgText x={PAD.l} y={PAD.t - 4} fill={AXIS_TXT} fontSize={9}>
        {`${formatNumber(max, 1)} ${unit(metric, currency)}`}
      </SvgText>
      {n > 0 && (
        <>
          <Polyline points={poly(pveCum)} fill="none" stroke={SERIES.pve} strokeWidth={2} />
          <Polyline points={poly(nasCum)} fill="none" stroke={SERIES.nas} strokeWidth={2} />
          <Polyline points={poly(sumCum)} fill="none" stroke={SERIES.sum} strokeWidth={2} />
        </>
      )}
      {buckets.map((b, i) =>
        labels.has(i) ? (
          <SvgText key={b.key} x={x(i)} y={H - 8} fill={AXIS_TXT} fontSize={9} textAnchor="middle">
            {b.label}
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}

/** Stacked bar chart: pve on the bottom, nas on top — the full bar is the sum. */
export function StackedBarChart({
  buckets,
  metric,
  currency,
}: {
  buckets: Bucket[];
  metric: Metric;
  currency: string;
}) {
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => b.nas + b.pve));
  const labels = xLabelIndices(n);
  const slot = n > 0 ? plotW / n : plotW;
  const barW = Math.min(26, slot * 0.62);

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={bottom} stroke={GRID} strokeWidth={1} />
      <Line x1={PAD.l} y1={bottom} x2={W - PAD.r} y2={bottom} stroke={GRID} strokeWidth={1} />
      <SvgText x={PAD.l} y={PAD.t - 4} fill={AXIS_TXT} fontSize={9}>
        {`${formatNumber(max, 1)} ${unit(metric, currency)}`}
      </SvgText>
      {buckets.flatMap((b, i) => {
        const cx = PAD.l + slot * (i + 0.5);
        const hPve = (b.pve / max) * plotH;
        const hNas = (b.nas / max) * plotH;
        return [
          <Rect key={`p${b.key}`} x={cx - barW / 2} y={bottom - hPve} width={barW} height={hPve} fill={SERIES.pve} />,
          <Rect key={`n${b.key}`} x={cx - barW / 2} y={bottom - hPve - hNas} width={barW} height={hNas} fill={SERIES.nas} />,
        ];
      })}
      {buckets.map((b, i) =>
        labels.has(i) ? (
          <SvgText key={`l${b.key}`} x={PAD.l + slot * (i + 0.5)} y={H - 8} fill={AXIS_TXT} fontSize={9} textAnchor="middle">
            {b.label}
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={seg.row}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[seg.btn, active && seg.btnActive]}
          >
            <Text style={[seg.txt, active && seg.txtActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const seg = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  btn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  txt: {
    color: '#9aa3b2',
    fontSize: 13,
    fontWeight: '500',
  },
  txtActive: {
    color: '#e7e9ee',
  },
});
