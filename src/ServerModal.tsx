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

import { DEFAULT_SSH, SERVERS, type ServerKey, type SshConfig } from './config';
import { storageDiag } from './storage';

type IpMap = Record<ServerKey, string[]>;

const clone = (m: IpMap): IpMap => ({ nas: [...m.nas], pve: [...m.pve], vm: [...m.vm] });

export function ServerModal({
  visible,
  onClose,
  servers,
  ssh,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  servers: IpMap;
  ssh: SshConfig;
  onSave: (servers: IpMap, ssh: SshConfig) => void;
}) {
  const [local, setLocal] = useState<IpMap>(() => clone(servers));
  const [sshUser, setSshUser] = useState(ssh.user);
  const [sshPort, setSshPort] = useState(String(ssh.port));
  const [sshPassword, setSshPassword] = useState(ssh.password);
  const [sshCommand, setSshCommand] = useState(ssh.command);
  const [diag, setDiag] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setLocal(clone(servers));
    setSshUser(ssh.user);
    setSshPort(String(ssh.port));
    setSshPassword(ssh.password);
    setSshCommand(ssh.command);
    storageDiag().then(setDiag);
  }, [visible, servers, ssh]);

  const setIp = (key: ServerKey, index: number, value: string) =>
    setLocal((prev) => ({ ...prev, [key]: prev[key].map((ip, i) => (i === index ? value : ip)) }));
  const addIp = (key: ServerKey) => setLocal((prev) => ({ ...prev, [key]: [...prev[key], ''] }));
  const removeIp = (key: ServerKey, index: number) =>
    setLocal((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));

  const dirty =
    JSON.stringify(local) !== JSON.stringify(servers) ||
    sshUser !== ssh.user ||
    sshPort !== String(ssh.port) ||
    sshPassword !== ssh.password ||
    sshCommand !== ssh.command;

  const save = () => {
    const cleaned: IpMap = {
      nas: local.nas.map((s) => s.trim()).filter(Boolean),
      pve: local.pve.map((s) => s.trim()).filter(Boolean),
      vm: local.vm.map((s) => s.trim()).filter(Boolean),
    };
    const port = parseInt(sshPort, 10);
    const cleanedSsh: SshConfig = {
      user: sshUser.trim() || DEFAULT_SSH.user,
      port: Number.isFinite(port) && port > 0 ? port : DEFAULT_SSH.port,
      password: sshPassword,
      command: sshCommand.trim() || DEFAULT_SSH.command,
    };
    onSave(cleaned, cleanedSsh);
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
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.note}>
              Add multiple IPs per server (e.g. local + Tailscale). The app uses whichever is reachable.
            </Text>

            {SERVERS.map((meta) => (
              <View key={meta.key} style={styles.block}>
                <Text style={styles.blockTitle}>{meta.label}</Text>
                {local[meta.key].length === 0 && <Text style={styles.dim}>No IPs</Text>}
                {local[meta.key].map((ip, i) => (
                  <View key={i} style={styles.row}>
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

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Graceful shutdown (SSH)</Text>
              <Text style={styles.dim}>
                Safely shuts down pve before cutting power. Leave the password empty to just cut power.
              </Text>
              <View style={styles.fieldRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.fieldLabel}>User</Text>
                  <TextInput
                    value={sshUser}
                    onChangeText={setSshUser}
                    placeholder="root"
                    placeholderTextColor={C.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Port</Text>
                  <TextInput
                    value={sshPort}
                    onChangeText={setSshPort}
                    placeholder="22"
                    placeholderTextColor={C.textTertiary}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                value={sshPassword}
                onChangeText={setSshPassword}
                placeholder="(SSH password)"
                placeholderTextColor={C.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Command</Text>
              <TextInput
                value={sshCommand}
                onChangeText={setSshCommand}
                placeholder="shutdown -h now"
                placeholderTextColor={C.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Storage debug (temporary)</Text>
              {diag.map((line, i) => (
                <Text key={i} style={styles.debugLine}>
                  {line}
                </Text>
              ))}
              <Text style={styles.debugLine}>loaded nas: {servers.nas.join(', ') || '(none)'}</Text>
              <Text style={styles.debugLine}>loaded pve: {servers.pve.join(', ') || '(none)'}</Text>
              <Text style={styles.debugLine}>loaded vm: {servers.vm.join(', ') || '(none)'}</Text>
            </View>
          </ScrollView>

          {dirty && (
            <View style={styles.footer}>
              <Pressable onPress={save} style={styles.saveBtn}>
                <Feather name="check" size={18} color="#0b0d12" />
                <Text style={styles.saveText}>Save changes</Text>
              </Pressable>
            </View>
          )}
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
  scroll: {
    flex: 1,
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
  block: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 8,
  },
  blockTitle: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  dim: {
    color: C.textTertiary,
    fontSize: 13,
    lineHeight: 18,
  },
  debugLine: {
    color: C.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  row: {
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
  fieldRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldLabel: {
    color: C.textTertiary,
    fontSize: 12,
    marginBottom: 4,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
