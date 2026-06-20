import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={['#10131a', '#0b0d12']} style={StyleSheet.absoluteFill} />
      <StatusBar style="light" />
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Feather name="lock" size={44} color="#34d399" />
        </View>
        <Text style={styles.title}>pveSwitch</Text>
        <Text style={styles.subtitle}>Locked</Text>
        <Pressable
          onPress={onUnlock}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Feather name="unlock" size={16} color="#0b0d12" />
          <Text style={styles.buttonText}>Unlock</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b0d12',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  center: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.45)',
    backgroundColor: 'rgba(52,211,153,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  title: {
    color: '#e7e9ee',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#5b6472',
    fontSize: 14,
    marginTop: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 34,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: '#34d399',
  },
  buttonText: {
    color: '#0b0d12',
    fontSize: 16,
    fontWeight: '600',
  },
});
