/**
 * Login Screen
 * Redesigned to match the web application's login styling exactly.
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

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [loginRole, setLoginRole] = useState<'customer' | 'admin'>('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (loginRole === 'customer' && !/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    
    try {
      // The web app appends @admin.loyaltyhub.com to the Admin ID for Supabase Auth
      const authEmail = loginRole === 'admin' 
        ? (email.includes('@') ? email.trim() : `${email.trim()}@admin.loyaltyhub.com`)
        : email.trim().toLowerCase();
      
      const result = await login(authEmail, password);
      if (!result.success) {
        setError(result.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          
          {/* Top Section (Gradient-like Dark Blue) */}
          <View style={styles.topSection}>
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.welcomeSubtext}>
              {loginRole === 'admin'
                ? 'Sign in to manage members, points, and reports.'
                : 'Sign in to access your loyalty program account and manage your rewards.'}
            </Text>
            
            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <View style={styles.benefitDot} />
                <Text style={styles.benefitText}>Track your points</Text>
              </View>
              <View style={styles.benefitItem}>
                <View style={styles.benefitDot} />
                <Text style={styles.benefitText}>Exclusive member benefits</Text>
              </View>
              <View style={styles.benefitItem}>
                <View style={styles.benefitDot} />
                <Text style={styles.benefitText}>Redeem rewards</Text>
              </View>
            </View>
          </View>

          {/* Bottom Section (White Form) */}
          <View style={styles.bottomSection}>
            <Text style={styles.loginTitle}>Log In</Text>
            <Text style={styles.loginSubtitle}>Enter your credentials to continue</Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorBoxText}>{error}</Text>
              </View>
            )}

            {/* Role Switcher */}
            <Text style={styles.label}>Login As</Text>
            <View style={styles.roleSwitcher}>
              <TouchableOpacity
                style={[styles.roleButton, loginRole === 'customer' && styles.roleButtonActive]}
                onPress={() => { setLoginRole('customer'); setError(null); }}
              >
                <Ionicons name="person-outline" size={18} color={loginRole === 'customer' ? '#1f2937' : '#4b5563'} style={styles.roleIcon} />
                <Text style={[styles.roleButtonText, loginRole === 'customer' && styles.roleButtonTextActive]}>
                  Customer
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.roleButton, loginRole === 'admin' && styles.roleButtonActive]}
                onPress={() => { setLoginRole('admin'); setError(null); }}
              >
                <Ionicons name="settings-outline" size={18} color={loginRole === 'admin' ? '#1f2937' : '#4b5563'} style={styles.roleIcon} />
                <Text style={[styles.roleButtonText, loginRole === 'admin' && styles.roleButtonTextActive]}>
                  Admin
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inputs */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{loginRole === 'admin' ? 'Admin ID' : 'Email'}</Text>
              <TextInput
                style={styles.input}
                placeholder={loginRole === 'admin' ? 'e.g., ADMIN0001' : 'your.email@example.com'}
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={(text) => { setEmail(text); setError(null); }}
                autoCapitalize="none"
                keyboardType={loginRole === 'admin' ? 'default' : 'email-address'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#9ca3af"
                  value={password}
                  onChangeText={(text) => { setPassword(text); setError(null); }}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password Link */}
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotPassContainer}>
              <Text style={styles.forgotPassText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {loginRole === 'admin' ? 'Log In as Admin' : 'Log In'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Register Link */}
            {loginRole === 'customer' && (
              <View style={styles.registerContainer}>
                <Text style={styles.registerText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                  <Text style={styles.registerLink}>Register here</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingVertical: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  topSection: {
    backgroundColor: '#1e293b',
    padding: 32,
    paddingTop: 40,
  },
  iconContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#1bb9d3',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  welcomeSubtext: {
    fontSize: 16,
    color: '#cbd5e1',
    lineHeight: 24,
    marginBottom: 24,
  },
  benefitsList: {
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitDot: {
    width: 8,
    height: 8,
    backgroundColor: '#1bb9d3',
    borderRadius: 4,
  },
  benefitText: {
    fontSize: 14,
    color: '#cbd5e1',
  },
  bottomSection: {
    padding: 32,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  errorBoxText: {
    color: '#991b1b',
    fontSize: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  roleSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  roleButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  roleIcon: {
    marginRight: 6,
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  roleButtonTextActive: {
    color: '#1f2937',
  },
  inputGroup: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#dbe4f2',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 15,
    color: '#1f2937',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbe4f2',
    borderRadius: 12,
    height: 48,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#1f2937',
  },
  eyeIcon: {
    padding: 12,
  },
  forgotPassContainer: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPassText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1bb9d3',
  },
  submitButton: {
    backgroundColor: '#1bb9d3',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1bb9d3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  registerText: {
    fontSize: 14,
    color: '#4b5563',
  },
  registerLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1bb9d3',
  },
});
