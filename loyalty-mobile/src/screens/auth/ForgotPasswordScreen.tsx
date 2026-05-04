/**
 * Forgot Password Screen
 * Email form to request password reset
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { forgotPassword } from '../../services/AuthService';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type ForgotPasswordScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
};

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const validate = (): boolean => {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email');
      return false;
    }
    setError('');
    return true;
  };

  const handleReset = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await forgotPassword(email);
      if (result.success) {
        setSent(true);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle" size={64} color="#4ecca3" />
          <Text style={styles.successTitle}>Email Sent!</Text>
          <Text style={styles.successText}>
            Check your inbox at <Text style={styles.emailHighlight}>{email}</Text> for instructions to reset your password.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.buttonText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Ionicons name="key-outline" size={48} color="#e94560" style={styles.icon} />
        <Text style={styles.heading}>Reset Password</Text>
        <Text style={styles.subheading}>
          Enter the email associated with your account and we'll send you a reset link.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
            <Ionicons name="mail-outline" size={20} color="#8892b0" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#5a6380"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>← Back to Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e', justifyContent: 'center', padding: 24 },
  content: { alignItems: 'center' },
  icon: { marginBottom: 16 },
  heading: { fontSize: 24, fontWeight: '800', color: '#e2e8f0', marginBottom: 8 },
  subheading: { fontSize: 14, color: '#8892b0', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  inputGroup: { width: '100%', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#a8b2d1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 1.5, borderColor: '#2a2a4a', paddingHorizontal: 14, height: 50 },
  inputError: { borderColor: '#e94560' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#e2e8f0', fontSize: 15 },
  errorText: { color: '#e94560', fontSize: 12, marginTop: 4, marginLeft: 4 },
  button: { backgroundColor: '#e94560', borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center', width: '100%', marginTop: 8 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkButton: { marginTop: 20 },
  linkText: { color: '#e94560', fontSize: 14, fontWeight: '500' },
  successCard: { alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 16, padding: 32 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#4ecca3', marginTop: 16, marginBottom: 8 },
  successText: { fontSize: 14, color: '#8892b0', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emailHighlight: { color: '#e94560', fontWeight: '600' },
});
