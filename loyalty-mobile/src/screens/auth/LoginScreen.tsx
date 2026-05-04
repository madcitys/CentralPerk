/**
 * Login Screen
 * Email/password form wired to AuthContext
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
import { useAuth } from '../../context/AuthContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { login } = useAuth();

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Enter a valid email';
    }
    if (!password.trim()) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        Alert.alert('Login Failed', result.error || 'Invalid credentials');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Ionicons name="diamond" size={48} color="#e94560" />
        <Text style={styles.title}>Loyalty Mobile</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.inputWrapper, errors.email ? styles.inputError : null]}>
            <Ionicons name="mail-outline" size={20} color="#8892b0" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#5a6380"
              value={email}
              onChangeText={(text) => { setEmail(text); setErrors(prev => ({ ...prev, email: undefined })); }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={[styles.inputWrapper, errors.password ? styles.inputError : null]}>
            <Ionicons name="lock-closed-outline" size={20} color="#8892b0" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#5a6380"
              value={password}
              onChangeText={(text) => { setPassword(text); setErrors(prev => ({ ...prev, password: undefined })); }}
              secureTextEntry={!showPassword}
              autoComplete="password"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#8892b0"
              />
            </TouchableOpacity>
          </View>
          {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginButtonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.forgotButton}
          onPress={() => navigation.navigate('ForgotPassword')}
        >
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.registerButton}
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={styles.registerButtonText}>Create New Account</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        💡 Tip: Use "admin@test.com" to login as program_manager
      </Text>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e2e8f0',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#8892b0',
    marginTop: 6,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a8b2d1',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2a2a4a',
    paddingHorizontal: 14,
    height: 50,
  },
  inputError: {
    borderColor: '#e94560',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 15,
  },
  errorText: {
    color: '#e94560',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  loginButton: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  forgotButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  forgotText: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2a2a4a',
  },
  dividerText: {
    color: '#5a6380',
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  registerButton: {
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e94560',
  },
  registerButtonText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: '#5a6380',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
});
