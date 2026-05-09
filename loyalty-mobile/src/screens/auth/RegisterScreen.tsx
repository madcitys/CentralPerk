/**
 * Register Screen
 * Full registration form matching the web app (localhost:3000/register) design exactly.
 * Fields: First Name, Last Name, Email, Phone, Birthdate, Password, Referral Code (optional)
 */
import React, { useState, createElement } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { CustomDatePicker } from '../../components/CustomDatePicker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type RegisterScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [photoName, setPhotoName] = useState('No file chosen');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  
  const { register } = useAuth();

  const pickImage = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to upload a photo.');
          return;
        }
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uriParts = result.assets[0].uri.split('/');
        setPhotoName(uriParts[uriParts.length - 1]);
      }
    } catch (error) {
      console.log('Error picking image:', error);
      Alert.alert('Error', 'Failed to open image picker.');
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = 'First Name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last Name is required';
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Enter a valid email';
    }
    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }
    if (!birthdate.trim()) {
      newErrors.birthdate = 'Birthdate is required';
    }
    if (!password.trim()) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Minimum 8 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const result = await register(fullName, email.trim().toLowerCase(), password);
      if (!result.success) {
        Alert.alert('Registration Failed', result.error || 'Could not create account');
      } else {
        navigation.navigate('Login');
        Alert.alert(
          'Account Created ✅',
          'Registration complete! You can now log in with your credentials.'
        );
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
        <View style={styles.card}>
          <View style={styles.headerSection}>
            <View style={styles.iconContainer}>
              <Ionicons name="person-add-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.heading}>Join Our Program</Text>
            <Text style={styles.subheading}>Create your account and start earning rewards today.</Text>

            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>Instant member number</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>Earn points on every purchase</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>Exclusive member offers</Text>
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.formTitle}>Create Account</Text>
            <Text style={styles.formSubtitle}>Fill in your details to get started</Text>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={[styles.input, errors.firstName && styles.inputError]}
                  placeholder="John"
                  placeholderTextColor="#94a3b8"
                  value={firstName}
                  onChangeText={(t) => { setFirstName(t); clearError('firstName'); }}
                />
                {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
              </View>

              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={[styles.input, errors.lastName && styles.inputError]}
                  placeholder="Doe"
                  placeholderTextColor="#94a3b8"
                  value={lastName}
                  onChangeText={(t) => { setLastName(t); clearError('lastName'); }}
                />
                {errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  placeholder="your.email@example.com"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={(t) => { setEmail(t); clearError('email'); }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
              </View>

              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={[styles.input, errors.phone && styles.inputError]}
                  placeholder="+63 912 345 6789"
                  placeholderTextColor="#94a3b8"
                  value={phone}
                  onChangeText={(t) => { setPhone(t); clearError('phone'); }}
                  keyboardType="phone-pad"
                />
                {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Birthdate</Text>
              <View style={styles.iconInputWrapper}>
                <TouchableOpacity 
                  style={[styles.input, styles.iconInput, errors.birthdate && styles.inputError, { justifyContent: 'center' }]}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: birthdate ? '#0f172a' : '#94a3b8' }}>{birthdate || 'dd/mm/yyyy'}</Text>
                </TouchableOpacity>
                <View style={styles.rightIcon} pointerEvents="none">
                  <Ionicons name="calendar-outline" size={20} color="#64748b" />
                </View>
              </View>
              {errors.birthdate && <Text style={styles.errorText}>{errors.birthdate}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.iconInputWrapper}>
                <TextInput
                  style={[styles.input, styles.iconInput, errors.password && styles.inputError]}
                  placeholder="Minimum 8 characters"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={(t) => { setPassword(t); clearError('password'); }}
                  secureTextEntry={!isPasswordVisible}
                />
                <TouchableOpacity
                  style={styles.rightIcon}
                  onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                >
                  <Ionicons name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Profile Photo (Optional)</Text>
              <TouchableOpacity style={[styles.fileInputContainer, { overflow: 'hidden', position: 'relative' }]} onPress={Platform.OS !== 'web' ? pickImage : undefined}>
                <Text style={styles.fileInputText}>Choose File  {photoName}</Text>
                {Platform.OS === 'web' && createElement('input', {
                  type: 'file',
                  accept: 'image/*',
                  style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                  },
                  onChange: (e: any) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setPhotoName(e.target.files[0].name);
                      setProfilePhoto(URL.createObjectURL(e.target.files[0]));
                    }
                  }
                })}
              </TouchableOpacity>
              <Text style={styles.helperText}>
                Add a profile photo now, or skip it and upload one later from your profile page.
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Referral Code (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="REF000123"
                placeholderTextColor="#94a3b8"
                value={referralCode}
                onChangeText={setReferralCode}
                autoCapitalize="characters"
              />
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
              <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Log in</Text></Text>
            </TouchableOpacity>
          </View>
        </View>

        <CustomDatePicker 
          visible={showDatePicker} 
          currentDate={date} 
          onClose={() => setShowDatePicker(false)} 
          onSelectDate={(selectedDate) => {
            setDate(selectedDate);
            setShowDatePicker(false);
            const day = String(selectedDate.getDate()).padStart(2, '0');
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const year = selectedDate.getFullYear();
            setBirthdate(`${day}/${month}/${year}`);
            clearError('birthdate');
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scroll: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  headerSection: {
    backgroundColor: '#0f172a',
    padding: 28,
    paddingBottom: 24,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 52,
    height: 52,
    backgroundColor: '#1bb9d3',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
    marginBottom: 20,
  },
  bulletList: {
    width: '100%',
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    backgroundColor: '#1bb9d3',
    borderRadius: 3,
    marginRight: 10,
  },
  bulletText: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  formSection: {
    padding: 28,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfWidth: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    backgroundColor: '#e2e8f0', // matching web light gray-blue
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  iconInputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  iconInput: {
    paddingRight: 48,
  },
  rightIcon: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
  },
  fileInputContainer: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fileInputText: {
    fontSize: 14,
    color: '#64748b',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 18,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 11,
    marginTop: 4,
    marginLeft: 2,
  },
  button: {
    width: '100%',
    backgroundColor: '#1bb9d3', // web cyan
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#1bb9d3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#64748b',
    fontSize: 14,
  },
  linkBold: {
    color: '#1bb9d3',
    fontWeight: '600',
  },
});
