import { useEffect, useRef, useState } from 'react';
import { ensureWelcomePackage, uploadRegistrationProfilePhoto } from '../app/lib/loyalty-supabase';
import { applyReferralCodeForSignup, validateReferralCode } from '../app/lib/member-lifecycle';
import { CalendarDatePicker } from './calendar-date-picker';
import {
  isCustomerDemoAuthEnabled,
  isCustomerDemoAuthForced,
  isDemoEmail,
  isValidPhilippinePhoneNumber,
  mapAuthErrorToMessage,
  registerCustomer,
} from '../app/auth/customer-auth';
import {
  AUTH_REQUIRE_EMAIL_CONFIRMATION_HINT,
  EMAIL_CONFIRMATION_REQUIRED_MESSAGE,
  EXISTING_ACCOUNT_RECOVERY_MESSAGE,
} from '../app/auth/auth-config';

const RATE_LIMIT_COOLDOWN_MS = 60_000;
const REGISTRATION_COOLDOWN_STORAGE_KEY = 'centralperk-registration-cooldown-until-ms';
const CURRENT_YEAR = new Date().getFullYear();

interface Member {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthdate: string;
  currentPointsBalance: number;
  createdAt: string;
  profilePhotoUrl?: string;
}

interface ReferralValidationState {
  state: 'idle' | 'checking' | 'valid' | 'invalid';
  text: string;
}

const DEMO_AUTH_SUCCESS_MESSAGE =
  'Registration complete in Development Demo Auth mode. You are signed in without email confirmation.';

export function RegistrationCard() {
  const demoAuthEnabled = isCustomerDemoAuthEnabled();
  const forceDemoAuth = isCustomerDemoAuthForced();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthdate: '',
    password: '',
    referralCode: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") || "" : "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [registeredMember, setRegisteredMember] = useState<Member | null>(null);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [referralValidation, setReferralValidation] = useState<ReferralValidationState>({
    state: formData.referralCode.trim() ? 'checking' : 'idle',
    text: '',
  });

  const cooldownSecondsRemaining = cooldownUntilMs
    ? Math.max(0, Math.ceil((cooldownUntilMs - currentTimeMs) / 1000))
    : 0;
  const isCooldownActive = cooldownSecondsRemaining > 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedCooldown = window.localStorage.getItem(REGISTRATION_COOLDOWN_STORAGE_KEY);
    if (!storedCooldown) return;

    const parsedCooldown = Number(storedCooldown);
    if (!Number.isFinite(parsedCooldown) || parsedCooldown <= Date.now()) {
      window.localStorage.removeItem(REGISTRATION_COOLDOWN_STORAGE_KEY);
      return;
    }

    setCooldownUntilMs(parsedCooldown);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (cooldownUntilMs && cooldownUntilMs > Date.now()) {
      window.localStorage.setItem(REGISTRATION_COOLDOWN_STORAGE_KEY, String(cooldownUntilMs));
      return;
    }

    window.localStorage.removeItem(REGISTRATION_COOLDOWN_STORAGE_KEY);
  }, [cooldownUntilMs]);

  useEffect(() => {
    if (!isCooldownActive) return;
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isCooldownActive]);

  useEffect(() => {
    const referralCode = formData.referralCode.trim();
    if (!referralCode) {
      setReferralValidation({ state: 'idle', text: '' });
      return;
    }

    let isCancelled = false;
    setReferralValidation({ state: 'checking', text: 'Checking referral code...' });

    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await validateReferralCode(referralCode);
        if (isCancelled) return;

        if (result.isValid) {
          setReferralValidation({
            state: 'valid',
            text: result.referrerName
              ? `Referral code accepted. Referrer: ${result.referrerName}.`
              : 'Referral code accepted.',
          });
          return;
        }

        setReferralValidation({
          state: 'invalid',
          text: result.reason === 'invalid'
            ? 'This referral code could not be found.'
            : 'Enter a referral code to validate it.',
        });
      } catch (error) {
        if (isCancelled) return;
        console.error('Referral validation error:', error);
        setReferralValidation({
          state: 'invalid',
          text: 'We could not validate the referral code right now.',
        });
      }
    }, 400);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [formData.referralCode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setProfilePhotoFile(file);
  };

  const normalizeEmail = (rawEmail: string) => rawEmail.trim().toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || isSubmitting) return;
    if (!formData.birthdate) {
      setMessage({
        type: 'error',
        text: 'Please select your birthdate before continuing.',
      });
      return;
    }
    if (isCooldownActive) {
      setMessage({
        type: 'error',
        text: `Too many registration attempts right now. Please wait ${cooldownSecondsRemaining} seconds and try again.`,
      });
      return;
    }
    submitLockRef.current = true;
    setIsSubmitting(true);
    setMessage(null);
    setRegisteredMember(null);

    let authUserAlreadyExisted = false;
    const normalizedEmail = normalizeEmail(formData.email);

    try {
      const registerResult = await registerCustomer({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: normalizedEmail,
        phone: formData.phone,
        birthdate: formData.birthdate,
        password: formData.password,
      });
      const { memberRecord, recoveredFromExistingAuthSignup } = registerResult;
      authUserAlreadyExisted = registerResult.authUserAlreadyExisted;

      const emailConfirmationRequired = registerResult.emailConfirmationRequired;
      const immediateLoginAvailable = registerResult.immediateLoginAvailable;
      let successMessage = emailConfirmationRequired
        ? EMAIL_CONFIRMATION_REQUIRED_MESSAGE
        : immediateLoginAvailable
          ? 'Registration complete. You can now log in.'
          : 'Registration completed.';

      if (registerResult.authMode === 'demo') {
        successMessage = DEMO_AUTH_SUCCESS_MESSAGE;
      }

      const welcomeResult = await ensureWelcomePackage(memberRecord.member_number, memberRecord.email);
      const memberPointsBalance = Number(welcomeResult.newBalance ?? memberRecord.points_balance ?? 0);
      let profilePhotoUrl: string | undefined;

      if (welcomeResult.granted && immediateLoginAvailable) {
        successMessage = 'Registration complete. Welcome package applied. You can now log in.';
      }

      const canUploadProfilePhotoNow = profilePhotoFile && registerResult.authMode === 'supabase' && immediateLoginAvailable;

      if (canUploadProfilePhotoNow) {
        try {
          profilePhotoUrl = await uploadRegistrationProfilePhoto(memberRecord.member_number, profilePhotoFile);
          successMessage = `${successMessage} Your profile photo was uploaded successfully.`;
        } catch (photoError) {
          console.error('Profile photo upload error:', photoError);
          successMessage = `${successMessage} We created your account, but the profile photo upload needs to be retried from your profile page.`;
        }
      } else if (profilePhotoFile) {
        successMessage = `${successMessage} Your profile photo was not uploaded yet because storage access becomes available after you sign in. Please upload it from your profile page after logging in.`;
      }

      if (formData.referralCode.trim()) {
        const referral = await applyReferralCodeForSignup({
          referralCode: formData.referralCode.trim(),
          refereeMemberId: String(memberRecord.member_number),
          refereeEmail: String(memberRecord.email),
        });
        if (!referral.applied) {
          successMessage = `${successMessage} Note: your referral code was invalid or not applicable.`;
        }
      }

      if (recoveredFromExistingAuthSignup) {
        successMessage = `${successMessage} We also repaired an incomplete member profile from an earlier signup attempt.`;
      }
      if (authUserAlreadyExisted) {
        successMessage = `${EXISTING_ACCOUNT_RECOVERY_MESSAGE} We completed your member profile setup.`;
      } else if (emailConfirmationRequired && AUTH_REQUIRE_EMAIL_CONFIRMATION_HINT) {
        successMessage = `${EMAIL_CONFIRMATION_REQUIRED_MESSAGE} Check your inbox for the confirmation link, then sign in.`;
      }

      // Update state with new member data
      setRegisteredMember({
        id: String(memberRecord.id ?? memberRecord.member_id ?? ''),
        memberNumber: memberRecord.member_number,
        firstName: memberRecord.first_name,
        lastName: memberRecord.last_name,
        email: memberRecord.email,
        phone: memberRecord.phone,
        birthdate: formData.birthdate,
        currentPointsBalance: memberPointsBalance,
        createdAt: memberRecord.enrollment_date,
        profilePhotoUrl,
      });

      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        birthdate: '',
        password: '',
        referralCode: '',
      });
      setProfilePhotoFile(null);
      setReferralValidation({ state: 'idle', text: '' });

      setMessage({
        type: 'success',
        text: successMessage,
      });

      console.log('Member registered:', memberRecord);
    } catch (error) {
      console.error('Registration error:', error);
      const mappedError = mapAuthErrorToMessage(error);
      if (mappedError.toLowerCase().includes('rate limit')) {
        setCooldownUntilMs(Date.now() + RATE_LIMIT_COOLDOWN_MS);
      }

      setMessage({
        type: 'error',
        text: mappedError,
      });
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  return (
    <div className="w-full bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="flex flex-col md:flex-row">
        {/* Left Side - Branded Area */}
        <div className="w-full md:w-2/5 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-12 flex flex-col justify-center text-white">
          <div className="mb-8">
            <div className="w-16 h-16 bg-[#1bb9d3] rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h2 className="text-4xl font-bold mb-4">Join Our Program</h2>
            <p className="text-gray-300 text-lg">Create your account and start earning rewards today.</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-[#1bb9d3] rounded-full"></div>
              <span className="text-sm text-gray-300">Instant member number</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-[#1bb9d3] rounded-full"></div>
              <span className="text-sm text-gray-300">Earn points on every purchase</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-[#1bb9d3] rounded-full"></div>
              <span className="text-sm text-gray-300">Exclusive member offers</span>
            </div>
          </div>
        </div>

        {/* Right Side - Registration Form */}
        <div className="w-full md:w-3/5 p-12">
          <h1 className="mb-2 text-3xl font-semibold text-gray-800">
            Create Account
          </h1>
          <p className="mb-8 text-gray-500">Fill in your details to get started</p>
          
          {message && (
            <div
              className={`mb-6 p-4 rounded-xl ${
                message.type === 'success'
                  ? 'bg-[#f5f7fb] text-[#1A2B47] border border-[#1A2B47]/30'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {registeredMember && (
            <div className="mb-6 p-5 rounded-xl bg-[#1A2B47] text-white">
              {registeredMember.profilePhotoUrl ? (
                <div className="mb-4 flex items-center gap-3">
                  <img
                    src={registeredMember.profilePhotoUrl}
                    alt={`${registeredMember.firstName} ${registeredMember.lastName}`}
                    className="h-14 w-14 rounded-full border border-white/25 object-cover"
                  />
                  <div>
                    <p className="text-sm opacity-90">Welcome, {registeredMember.firstName}!</p>
                    <p className="text-xs opacity-75">Your optional profile photo has been saved.</p>
                  </div>
                </div>
              ) : null}
              <p className="text-sm opacity-90 mb-1">Your Member Number</p>
              <p className="text-2xl font-semibold mb-3">
                {registeredMember.memberNumber}
              </p>
              <div className="text-sm opacity-90">
                <p>Points Balance: <span className="font-semibold">{registeredMember.currentPointsBalance}</span></p>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Two-column grid for name fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block mb-2 text-gray-700 font-medium">
                  First Name
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#dbe4f2] rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#1bb9d3] focus:border-transparent transition-all"
                  placeholder="John"
                  required
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block mb-2 text-gray-700 font-medium">
                  Last Name
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#dbe4f2] rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#1bb9d3] focus:border-transparent transition-all"
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            {/* Two-column grid for email and phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="block mb-2 text-gray-700 font-medium">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#dbe4f2] rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#1bb9d3] focus:border-transparent transition-all"
                  placeholder="your.email@example.com"
                  required
                />
                {demoAuthEnabled && forceDemoAuth && (
                  <p className="mt-2 text-xs text-[#1A2B47]">
                    Demo auth is forced by configuration. Customer registration will stay local and bypass Supabase Auth.
                  </p>
                )}
                {demoAuthEnabled && !forceDemoAuth && formData.email && isDemoEmail(formData.email) && (
                  <p className="mt-2 text-xs text-[#1A2B47]">
                    Demo email detected and demo auth is enabled. Registration will bypass Supabase email confirmation and sign you in locally.
                  </p>
                )}
                {!demoAuthEnabled && formData.email && isDemoEmail(formData.email) && (
                  <p className="mt-2 text-xs text-amber-700">
                    Demo-style email detected, but demo auth is disabled by configuration. Registration will use Supabase Auth.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="block mb-2 text-gray-700 font-medium">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  onInvalid={(e) => {
                    const phoneValue = e.currentTarget.value;
                    if (!phoneValue.trim()) {
                      e.currentTarget.setCustomValidity('Please enter your phone number.');
                      return;
                    }

                    if (!isValidPhilippinePhoneNumber(phoneValue)) {
                      e.currentTarget.setCustomValidity(
                        'Please enter a valid Philippine mobile number, like +63 912 345 6789 or 09123456789.'
                      );
                      return;
                    }

                    e.currentTarget.setCustomValidity('');
                  }}
                  onInput={(e) => {
                    e.currentTarget.setCustomValidity('');
                  }}
                  className="w-full px-4 py-3 bg-[#dbe4f2] rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#1bb9d3] focus:border-transparent transition-all"
                  placeholder="+63 912 345 6789"
                  inputMode="tel"
                  required
                />
              </div>
            </div>

            {/* Birthdate field - full width */}
            <div>
              <label htmlFor="birthdate" className="block mb-2 text-gray-700 font-medium">
                Birthdate
              </label>
              <CalendarDatePicker
                id="birthdate"
                value={formData.birthdate}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    birthdate: value,
                  }))
                }
                placeholder="dd/mm/yyyy"
                fromYear={CURRENT_YEAR - 100}
                toYear={CURRENT_YEAR}
                variant="soft"
              />
            </div>

            {/* Password field - full width */}
            <div>
              <label htmlFor="password" className="block mb-2 text-gray-700 font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-transparent bg-[#dbe4f2] px-4 py-3 pr-14 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1bb9d3]"
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  aria-pressed={isPasswordVisible}
                  onClick={() => setIsPasswordVisible((prev) => !prev)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 transition-colors hover:text-[#1A2B47] focus:outline-none"
                >
                  {isPasswordVisible ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7-1 2.25-2.72 4.16-4.9 5.32" />
                      <path d="M6.61 6.61C4.62 7.83 3.06 9.73 2 12c1.73 3.89 6 7 10 7 1.55 0 3.04-.3 4.4-.85" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.64-7 10-7 10 7 10 7-3.64 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="profilePhoto" className="block mb-2 text-gray-700 font-medium">
                Profile Photo (Optional)
              </label>
              <input
                type="file"
                id="profilePhoto"
                name="profilePhoto"
                accept="image/*"
                onChange={handleProfilePhotoChange}
                className="w-full rounded-xl border border-dashed border-[#b8c7dc] bg-[#f5f7fb] px-4 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1bb9d3]"
              />
              <p className="mt-2 text-xs text-gray-500">
                Add a profile photo now, or skip it and upload one later from your profile page.
              </p>
              {profilePhotoFile ? (
                <p className="mt-2 text-xs text-[#1A2B47]">Selected file: {profilePhotoFile.name}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="referralCode" className="block mb-2 text-gray-700 font-medium">
                Referral Code (Optional)
              </label>
              <input
                type="text"
                id="referralCode"
                name="referralCode"
                value={formData.referralCode}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-[#dbe4f2] rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#1bb9d3] focus:border-transparent transition-all"
                placeholder="REF000123"
              />
              {referralValidation.text ? (
                <p
                  className={`mt-2 text-sm ${
                    referralValidation.state === 'valid'
                      ? 'text-green-700'
                      : referralValidation.state === 'invalid'
                        ? 'text-red-700'
                        : 'text-gray-500'
                  }`}
                >
                  {referralValidation.text}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isCooldownActive}
              className="w-full bg-[#1bb9d3] text-white py-3.5 rounded-xl hover:bg-[#18a9c0] transition-colors duration-200 mt-6 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg shadow-[#1bb9d3]/20"
            >
              {isSubmitting ? 'Registering...' : isCooldownActive ? `Try again in ${cooldownSecondsRemaining}s` : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
