/**
 * Register Screen
 * Full registration form wired to AuthContext
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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type RegisterScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { register } = useAuth();

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Enter a valid email';
    }
    if (!password.trim()) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Minimum 6 characters';
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await register(name, email, password);
      if (!result.success) {
        Alert.alert('Registration Failed', result.error || 'Could not create account');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearError = (field: string) => {
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Join the Loyalty Program</Text>
        <Text style={styles.subheading}>Create your member account</Text>

        {/* Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name</Text>
          <View style={[styles.inputWrapper, errors.name ? styles.inputError : null]}>
            <Ionicons name="person-outline" size={20} color="#8892b0" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="John Doe"
              placeholderTextColor="#5a6380"
              value={name}
              onChangeText={(t) => { setName(t); clearError('name'); }}
            />
          </View>
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        {/* Email */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.inputWrapper, errors.email ? styles.inputError : null]}>
            <Ionicons name="mail-outline" size={20} color="#8892b0" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#5a6380"
              value={email}
              onChangeText={(t) => { setEmail(t); clearError('email'); }}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>

        {/* Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={[styles.inputWrapper, errors.password ? styles.inputError : null]}>
            <Ionicons name="lock-closed-outline" size={20} color="#8892b0" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Min. 6 characters"
              placeholderTextColor="#5a6380"
              value={password}
              onChangeText={(t) => { setPassword(t); clearError('password'); }}
              secureTextEntry
            />
          </View>
          {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
        </View>

        {/* Confirm Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <View style={[styles.inputWrapper, errors.confirmPassword ? styles.inputError : null]}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#8892b0" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Re-enter password"
              placeholderTextColor="#5a6380"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); clearError('confirmPassword'); }}
              secureTextEntry
            />
          </View>
          {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Sign In</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e' },
  scroll: { padding: 24, paddingTop: 20 },
  heading: { fontSize: 24, fontWeight: '800', color: '#e2e8f0', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#8892b0', marginBottom: 28 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#a8b2d1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 1.5, borderColor: '#2a2a4a', paddingHorizontal: 14, height: 50 },
  inputError: { borderColor: '#e94560' },
  icon: { marginRight: 10 },
  input: { flex: 1, color: '#e2e8f0', fontSize: 15 },
  errorText: { color: '#e94560', fontSize: 12, marginTop: 4, marginLeft: 4 },
  button: { backgroundColor: '#e94560', borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkButton: { alignItems: 'center', marginTop: 20 },
  linkText: { color: '#8892b0', fontSize: 14 },
  linkBold: { color: '#e94560', fontWeight: '700' },
});
