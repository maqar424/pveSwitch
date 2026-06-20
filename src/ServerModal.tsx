import { useEffect, useState } from 'react';
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

import { SERVERS, type ServerKey } from './config';

type IpMap = Record<ServerKey, string[]>;

const clone = (m: IpMap): IpMap => ({ nas: [...m.nas], pve: [...m.pve], vm: [...m.vm] });

export function ServerModal({
  visible,
  onClose,
  servers,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  servers: IpMap;
  onSave: (next: IpMap) => void;
}) {
  const [local, setLocal] = useState<IpMap>(() => clone(servers));

  useEffect(() => {
    if (visible) setLocal(clone(servers));
  }, [visible, servers]);

  const setIp = (key: ServerKey, index: number, value: string) =>
    setLocal((prev) => ({ ...prev, [key]: prev[key].map((ip, i) => (i === index ? value : ip)) }));
  const addIp = (key: ServerKey) =>
    setLocal((prev) => ({ ...prev, [key]: [...prev[key], ''] }));
  const removeIp = (key: ServerKey, index: number) =>
    setLocal((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));

  const save = () => {
    const cleaned: IpMap = {
      nas: local.nas.map((s) => s.trim()).filter(Boolean),
      pve: local.pve.map((s) => s.trim()).filter(Boolean),
      vm: local.vm.map((s) => s.trim()).filter(Boolean),
    };
    onSave(cleaned);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Servers</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Feather name="x" size={20} color={C.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.note}>
              Add multiple IPs per server (e.g. local + Tailscale). The app uses whichever is reachable.
            </Text>

            {SERVERS.map((meta) => (
              <View key={meta.key} style={styles.serverBlock}>
                <Text style={styles.serverLabel}>{meta.label}</Text>
                {local[meta.key].length === 0 && <Text style={styles.empty}>No IPs</Text>}
                {local[meta.key].map((ip, i) => (
                  <View key={i} style={styles.ipRow}>
                    <TextInput
                      value={ip}
                      onChangeText={(v) => setIp(meta.key, i, v)}
                      placeholder="100.x.x.x or 192.168.x.x"
                      placeholderTextColor={C.textTertiary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                      style={styles.input}
                    />
                    <Pressable onPress={() => removeIp(meta.key, i)} hitSlop={8} style={styles.iconBtn}>
                      <Feather name="trash-2" size={16} color={C.textTertiary} />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => addIp(meta.key)} style={styles.addRow}>
                  <Feather name="plus" size={15} color={C.accent} />
                  <Text style={styles.addText}>Add IP</Text>
                </Pressable>
              </View>
            ))}

            <Pressable onPress={save} style={styles.saveBtn}>
              <Feather name="check" size={18} color="#0b0d12" />
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const C = {
  bg: '#0b0d12',
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
    gap: 14,
  },
  note: {
    color: C.textTertiary,
    fontSize: 13,
    lineHeight: 18,
  },
  serverBlock: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 8,
  },
  serverLabel: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  empty: {
    color: C.textTertiary,
    fontSize: 13,
  },
  ipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.textPrimary,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontVariant: ['tabular-nums'],
  },
  iconBtn: {
    padding: 6,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  addText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: C.accent,
  },
  saveText: {
    color: '#0b0d12',
    fontSize: 16,
    fontWeight: '600',
  },
});
