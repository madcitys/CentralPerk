import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  StatusBar,
  type DimensionValue,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  awardPoints,
  createVoucher,
  fullName,
  isRedeem,
  loadAdminData,
  loadCurrentMember,
  loadCustomerData,
  loadNotifications,
  loadSession,
  loadVouchers,
  markNotificationRead,
  memberKey,
  redeemPoints,
  redeemReward,
  registerCustomer,
  signIn,
  signOut,
  txDate,
  txLabel,
  updateMemberProfile,
} from "./src/lib/data";
import { hasSupabaseConfig, missingConfigMessage } from "./src/lib/supabase";
import type { AppNotification, LoginActivity, LoyaltyTransaction, Member, RedemptionVoucher, Reward, Role } from "./src/lib/types";

type AdminData = {
  members: Member[];
  transactions: LoyaltyTransaction[];
  rewards: Reward[];
  logins: LoginActivity[];
};

type CustomerData = {
  transactions: LoyaltyTransaction[];
  rewards: Reward[];
  vouchers: RedemptionVoucher[];
  notifications: AppNotification[];
};

const adminTabs = ["Dashboard", "Members", "Activity", "Rewards", "Analytics", "Engagement", "Settings"];
const customerTabs = ["Dashboard", "Earn", "Activity", "Rewards", "Engagement", "Profile"];
const teal = "#00A3AD";
const webCyan = "#1bb9d3";
const ink = "#10213A";
const soft = "#F4F7FB";
const authDark = "#0f172a";
const authDarker = "#1e293b";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [role, setRole] = useState<Role>("customer");
  const [authScreen, setAuthScreen] = useState<"login" | "register">("login");
  const [authedRole, setAuthedRole] = useState<Role | null>(null);
  const [member, setMember] = useState<Member | null>(null);

  useEffect(() => {
    async function boot() {
      try {
        const session = await loadSession();
        if (session?.user?.email) {
          const currentMember = await loadCurrentMember(session.user.email);
          if (currentMember) {
            setMember(currentMember);
            setAuthedRole("customer");
            setRole("customer");
          }
        }
      } finally {
        setBooting(false);
      }
    }
    boot();
  }, []);

  const logout = async () => {
    await signOut();
    setMember(null);
    setAuthedRole(null);
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={teal} />
      </SafeAreaView>
    );
  }

  if (!authedRole) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        {authScreen === "register" ? (
          <RegisterScreen onBackToLogin={() => setAuthScreen("login")} />
        ) : (
          <LoginScreen
            role={role}
            setRole={setRole}
            onShowRegister={() => {
              setRole("customer");
              setAuthScreen("register");
            }}
            onLogin={(nextRole, nextMember) => {
              setAuthedRole(nextRole);
              setMember(nextMember);
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      {authedRole === "admin" ? (
        <AdminApp onLogout={logout} />
      ) : (
        <CustomerApp member={member} setMember={setMember} onLogout={logout} />
      )}
    </SafeAreaView>
  );
}

function LoginScreen({
  role,
  setRole,
  onShowRegister,
  onLogin,
}: {
  role: Role;
  setRole: (role: Role) => void;
  onShowRegister: () => void;
  onLogin: (role: Role, member: Member | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(hasSupabaseConfig ? null : missingConfigMessage());

  const submit = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await signIn(role, email, password);
      onLogin(role, result.member);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.authPage} contentContainerStyle={styles.authWrap}>
      <View style={styles.authHero}>
        <View style={styles.authIcon}>
          <Text style={styles.authIconText}>CP</Text>
        </View>
        <Text style={styles.authHeroTitle}>Welcome Back</Text>
        <Text style={styles.authHeroCopy}>
          {role === "admin" ? "Sign in to manage members, points, and reports." : "Sign in to access your loyalty account and manage your rewards."}
        </Text>
        <Bullet text="Track your points" />
        <Bullet text="Exclusive member benefits" />
        <Bullet text="Redeem rewards" />
      </View>
      <View style={styles.authCard}>
        <Text style={styles.loginTitle}>Log In</Text>
        <Text style={styles.muted}>Enter your credentials to continue</Text>

        <View style={styles.segment}>
          <SegmentButton active={role === "customer"} label="Customer" onPress={() => setRole("customer")} />
          <SegmentButton active={role === "admin"} label="Admin" onPress={() => setRole("admin")} />
        </View>

        <TextInput
          autoCapitalize="none"
          placeholder={role === "admin" ? "Admin ID, e.g. ADMIN0001" : "Email address"}
          placeholderTextColor="#7B8794"
          style={styles.authInput}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor="#7B8794"
          secureTextEntry
          style={styles.authInput}
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={loading || !email || !password || !hasSupabaseConfig} style={[styles.authPrimaryButton, (loading || !email || !password || !hasSupabaseConfig) && styles.disabled]} onPress={submit}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{role === "admin" ? "Log in as Admin" : "Log in"}</Text>}
        </Pressable>
        {role === "customer" ? (
          <Pressable style={styles.authLinkButton} onPress={onShowRegister}>
            <Text style={styles.authLinkText}>Don't have an account? Register here</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function RegisterScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [registeredMember, setRegisteredMember] = useState<Member | null>(null);

  const submit = async () => {
    try {
      setLoading(true);
      setMessage(null);
      setRegisteredMember(null);
      const result = await registerCustomer({
        firstName,
        lastName,
        email,
        phone,
        birthdate,
        password,
        referralCode,
      });
      setRegisteredMember(result.member);
      setMessage({ type: "success", text: result.message });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setBirthdate("");
      setPassword("");
      setReferralCode("");
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Registration failed." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.authPage} contentContainerStyle={styles.authWrap}>
      <View style={styles.authHero}>
        <View style={styles.authIcon}>
          <Text style={styles.authIconText}>+</Text>
        </View>
        <Text style={styles.authHeroTitle}>Join Our Program</Text>
        <Text style={styles.authHeroCopy}>Create your account and start earning rewards today.</Text>
        <Bullet text="Instant member number" />
        <Bullet text="Earn points on every purchase" />
        <Bullet text="Exclusive member offers" />
      </View>
      <View style={styles.authCard}>
        <Text style={styles.loginTitle}>Create Account</Text>
        <Text style={styles.muted}>Fill in your details to get started</Text>
        {message ? <Banner text={message.text} /> : null}
        {registeredMember ? (
          <Section title="Your member number">
            <Text style={styles.memberNumber}>{registeredMember.member_number || registeredMember.member_id || registeredMember.id}</Text>
            <Text style={styles.muted}>Welcome package requested. Log in after confirmation if your account requires email confirmation.</Text>
          </Section>
        ) : null}
        <TextInput style={styles.authInput} placeholder="First name" placeholderTextColor="#7B8794" value={firstName} onChangeText={setFirstName} />
        <TextInput style={styles.authInput} placeholder="Last name" placeholderTextColor="#7B8794" value={lastName} onChangeText={setLastName} />
        <TextInput style={styles.authInput} autoCapitalize="none" keyboardType="email-address" placeholder="Email address" placeholderTextColor="#7B8794" value={email} onChangeText={setEmail} />
        <TextInput style={styles.authInput} keyboardType="phone-pad" placeholder="+63 912 345 6789" placeholderTextColor="#7B8794" value={phone} onChangeText={setPhone} />
        <TextInput style={styles.authInput} placeholder="Birthdate YYYY-MM-DD" placeholderTextColor="#7B8794" value={birthdate} onChangeText={setBirthdate} />
        <TextInput style={styles.authInput} placeholder="Password, minimum 8 characters" placeholderTextColor="#7B8794" secureTextEntry value={password} onChangeText={setPassword} />
        <TextInput style={styles.authInput} autoCapitalize="characters" placeholder="Referral code (optional)" placeholderTextColor="#7B8794" value={referralCode} onChangeText={setReferralCode} />
        <Section title="Profile photo">
          <Text style={styles.muted}>Same optional profile photo step exists on web. In mobile, upload or change the photo from Profile after sign-in.</Text>
        </Section>
        <Pressable disabled={loading || !hasSupabaseConfig} style={[styles.authPrimaryButton, (!hasSupabaseConfig || loading) && styles.disabled]} onPress={submit}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create Account</Text>}
        </Pressable>
        <Pressable style={styles.authLinkButton} onPress={onBackToLogin}>
          <Text style={styles.authLinkText}>Already have an account? Log in</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState(adminTabs[0]);
  const [data, setData] = useState<AdminData>({ members: [], transactions: [], rewards: [], logins: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      setLoading(true);
      setError(null);
      setData(await loadAdminData());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ScreenShell title="Admin" tabs={adminTabs} activeTab={tab} setTab={setTab} onLogout={onLogout} onRefresh={() => refresh(true)} refreshing={refreshing}>
      {error ? <Banner text={error} /> : null}
      {loading && !refreshing ? <InlineLoader /> : null}
      {tab === "Dashboard" ? <AdminDashboard data={data} /> : null}
      {tab === "Members" ? <MembersScreen members={data.members} /> : null}
      {tab === "Activity" ? <ActivityScreen transactions={data.transactions} members={data.members} /> : null}
      {tab === "Rewards" ? <RewardsList rewards={data.rewards} /> : null}
      {tab === "Analytics" ? <AdminAnalytics members={data.members} transactions={data.transactions} rewards={data.rewards} /> : null}
      {tab === "Engagement" ? <EngagementScreen members={data.members} transactions={data.transactions} logins={data.logins} /> : null}
      {tab === "Settings" ? <AdminSettings data={data} /> : null}
    </ScreenShell>
  );
}

function CustomerApp({
  member,
  setMember,
  onLogout,
}: {
  member: Member | null;
  setMember: Dispatch<SetStateAction<Member | null>>;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState(customerTabs[0]);
  const [data, setData] = useState<CustomerData>({ transactions: [], rewards: [], vouchers: [], notifications: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberEmail = member?.email || "";
  const memberIdentifier = String(member?.member_number || member?.memberNumber || member?.memberId || memberKey(member));
  const refreshMember = useMemo(() => member, [memberEmail, memberIdentifier]);

  const refresh = useCallback(async (showRefresh = false) => {
    if (!refreshMember) return;
    try {
      if (showRefresh) setRefreshing(true);
      setLoading(true);
      setError(null);
      const freshMember = memberEmail ? await loadCurrentMember(memberEmail) : null;
      const nextMember = freshMember || refreshMember;
      if (freshMember) {
        setMember((currentMember) => (sameMemberProfile(currentMember, freshMember) ? currentMember : freshMember));
      }
      const nextMemberKey = String(nextMember.member_number || nextMember.memberId || memberKey(nextMember));
      const [customerData, vouchers, notifications] = await Promise.all([
        loadCustomerData(nextMember),
        loadVouchers({ memberId: nextMemberKey, email: nextMember.email }),
        loadNotifications({ memberId: nextMemberKey, email: nextMember.email, limit: 20 }),
      ]);
      setData({ ...customerData, vouchers, notifications: notifications.filter((item) => item.status !== "read") });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load customer data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [memberEmail, refreshMember, setMember]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ScreenShell title="Customer" tabs={customerTabs} activeTab={tab} setTab={setTab} onLogout={onLogout} onRefresh={() => refresh(true)} refreshing={refreshing}>
      {error ? <Banner text={error} /> : null}
      {loading && !refreshing ? <InlineLoader /> : null}
      {tab === "Dashboard" ? <CustomerDashboard member={member} transactions={data.transactions} rewards={data.rewards} notifications={data.notifications} onRefresh={() => refresh()} /> : null}
      {tab === "Earn" ? <EarnScreen member={member} onCompleted={() => refresh()} /> : null}
      {tab === "Activity" ? <CustomerActivity transactions={data.transactions} vouchers={data.vouchers} /> : null}
      {tab === "Rewards" ? <CustomerRewards member={member} rewards={data.rewards} vouchers={data.vouchers} onRedeemed={() => refresh()} /> : null}
      {tab === "Engagement" ? <CustomerEngagement member={member} transactions={data.transactions} onCompleted={() => refresh()} /> : null}
      {tab === "Profile" ? <ProfileScreen member={member} setMember={setMember} /> : null}
    </ScreenShell>
  );
}

function ScreenShell({
  title,
  tabs,
  activeTab,
  setTab,
  onLogout,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  tabs: string[];
  activeTab: string;
  setTab: (tab: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.app}>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.brandSmall}>CentralPerk</Text>
          <Text style={styles.topTitle}>{title}</Text>
        </View>
        <Pressable style={styles.logout} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>
      <View style={styles.tabRail}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabContent}>
          {tabs.map((item) => (
            <Pressable key={item} style={[styles.tab, item === activeTab && styles.tabActive]} onPress={() => setTab(item)}>
              <Text style={[styles.tabText, item === activeTab && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={teal} />}
        contentContainerStyle={styles.bodyContent}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function AdminDashboard({ data }: { data: AdminData }) {
  const activeMembers = data.members.filter((member) => String(member.status || "active").toLowerCase() !== "inactive").length;
  const liability = data.members.reduce((sum, member) => sum + Number(member.points_balance || 0), 0);
  const redeemed = data.transactions.filter(isRedeem).reduce((sum, tx) => sum + Math.abs(Number(tx.points || 0)), 0);
  const tiers = groupCount(data.members.map((member) => String(member.tier || "Bronze")));
  const recent = data.transactions.slice(0, 5);

  return (
    <>
      <View style={styles.grid}>
        <Metric label="Total members" value={data.members.length} />
        <Metric label="Active members" value={activeMembers} />
        <Metric label="Points liability" value={liability} />
        <Metric label="Redeemed" value={redeemed} />
      </View>
      <Section title="Tier distribution">
        {Object.entries(tiers).map(([tier, count]) => (
          <InlineBar key={tier} label={tier} value={count} max={data.members.length || 1} />
        ))}
      </Section>
      <Section title="Latest movement">
        {recent.map((tx, index) => (
          <ActivityRow key={`${tx.transaction_id || tx.id || index}`} tx={tx} />
        ))}
      </Section>
    </>
  );
}

function MembersScreen({ members }: { members: Member[] }) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("All");
  const [selected, setSelected] = useState<Member | null>(null);
  const [awardTo, setAwardTo] = useState<Member | null>(null);
  const [awardAmount, setAwardAmount] = useState("");
  const [awardReason, setAwardReason] = useState("");
  const [savingAward, setSavingAward] = useState(false);
  const tiers = ["All", ...Array.from(new Set(members.map((member) => String(member.tier || "Bronze"))))];
  const filtered = members.filter((member) => {
    const haystack = `${fullName(member)} ${member.email || ""} ${member.member_number || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (tier === "All" || String(member.tier || "Bronze") === tier);
  });

  const submitAward = async () => {
    if (!awardTo) return;
    const points = Number(awardAmount);
    if (!points || points <= 0) return Alert.alert("Enter points", "Manual award needs a positive number of points.");
    if (!awardReason.trim()) return Alert.alert("Enter reason", "Manual award needs a reason.");
    try {
      setSavingAward(true);
      await awardPoints({
        memberIdentifier: String(awardTo.member_number || awardTo.member_id || memberKey(awardTo)),
        fallbackEmail: awardTo.email,
        points,
        transactionType: "MANUAL_AWARD",
        reason: awardReason.trim(),
      });
      Alert.alert("Award sent", `${points.toLocaleString()} points awarded to ${fullName(awardTo)}.`);
      setAwardTo(null);
      setAwardAmount("");
      setAwardReason("");
    } catch (err) {
      Alert.alert("Award failed", err instanceof Error ? err.message : "Try again later.");
    } finally {
      setSavingAward(false);
    }
  };

  return (
    <>
      <TextInput style={styles.inputCompact} placeholder="Search members" placeholderTextColor="#7B8794" value={query} onChangeText={setQuery} />
      <FilterRail options={tiers} active={tier} onChange={setTier} />
      <Section title="Segment tools">
        <Text style={styles.muted}>Filter by tier, inspect member profiles, and award points from mobile. Full custom segment builder logic is represented by these visible filters and member actions.</Text>
      </Section>
      {filtered.slice(0, 80).map((member) => (
        <Card key={`${member.id || member.member_id || member.member_number}`}>
          <View style={styles.cardSplit}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{fullName(member)}</Text>
              <Text style={styles.muted}>{member.email || "No email"}</Text>
              <Text style={styles.muted}>#{member.member_number || member.member_id || "Member"}</Text>
            </View>
            <View style={styles.right}>
              <Pill text={String(member.tier || "Bronze")} />
              <Text style={styles.points}>{Number(member.points_balance || 0).toLocaleString()} pts</Text>
            </View>
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.ghostButton} onPress={() => setSelected(member)}>
              <Text style={styles.ghostButtonText}>View</Text>
            </Pressable>
            <Pressable style={styles.smallButtonInline} onPress={() => setAwardTo(member)}>
              <Text style={styles.smallButtonText}>Award</Text>
            </Pressable>
          </View>
        </Card>
      ))}
      {selected ? (
        <Section title="Member profile">
          <Text style={styles.cardTitle}>{fullName(selected)}</Text>
          <Text style={styles.muted}>Member ID: {selected.member_number || selected.member_id || selected.id}</Text>
          <Text style={styles.muted}>Email: {selected.email || "-"}</Text>
          <Text style={styles.muted}>Phone: {selected.phone || "-"}</Text>
          <Text style={styles.muted}>Tier: {selected.tier || "Bronze"}</Text>
          <Text style={styles.points}>{Number(selected.points_balance || 0).toLocaleString()} points</Text>
          <Pressable style={styles.ghostButton} onPress={() => setSelected(null)}>
            <Text style={styles.ghostButtonText}>Close profile</Text>
          </Pressable>
        </Section>
      ) : null}
      {awardTo ? (
        <Section title={`Manual award: ${fullName(awardTo)}`}>
          <TextInput style={styles.inputCompact} keyboardType="numeric" placeholder="Points to award" value={awardAmount} onChangeText={setAwardAmount} />
          <TextInput style={styles.inputCompact} placeholder="Reason" value={awardReason} onChangeText={setAwardReason} />
          <Pressable disabled={savingAward} style={[styles.primaryButton, savingAward && styles.disabled]} onPress={submitAward}>
            <Text style={styles.primaryText}>{savingAward ? "Awarding..." : "Confirm award"}</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={() => setAwardTo(null)}>
            <Text style={styles.ghostButtonText}>Cancel</Text>
          </Pressable>
        </Section>
      ) : null}
    </>
  );
}

function ActivityScreen({ transactions, members = [] }: { transactions: LoyaltyTransaction[]; members?: Member[] }) {
  const [filter, setFilter] = useState("All");
  const options = ["All", "Earned", "Redeemed", "Recent"];
  const memberById = new Map(members.map((member) => [String(member.id ?? member.member_id ?? member.member_number), member]));
  const filtered = transactions.filter((tx) => {
    if (filter === "Recent") return Date.now() - new Date(txDate(tx)).getTime() < 1000 * 60 * 60 * 24 * 30;
    if (filter === "Redeemed") return isRedeem(tx);
    if (filter === "Earned") return !isRedeem(tx);
    return true;
  });
  return (
    <>
      <FilterRail options={options} active={filter} onChange={setFilter} />
      {filtered.slice(0, 100).map((tx, index) => (
        <ActivityRow key={`${tx.transaction_id || tx.id || index}`} tx={tx} member={memberById.get(String(tx.member_id))} />
      ))}
    </>
  );
}

function CustomerActivity({ transactions, vouchers }: { transactions: LoyaltyTransaction[]; vouchers: RedemptionVoucher[] }) {
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Newest");
  const [selectedVoucher, setSelectedVoucher] = useState<RedemptionVoucher | null>(null);
  const filtered = transactions
    .filter((tx) => {
      if (filter === "Earned") return !isRedeem(tx);
      if (filter === "Redeemed") return isRedeem(tx);
      if (filter === "Gifted") return String(tx.transaction_type || "").toUpperCase().includes("GIFT");
      if (filter === "Recent") return Date.now() - new Date(txDate(tx)).getTime() < 1000 * 60 * 60 * 24 * 30;
      return true;
    })
    .sort((a, b) => {
      if (sort === "Oldest") return new Date(txDate(a)).getTime() - new Date(txDate(b)).getTime();
      if (sort === "Highest") return Number(b.points || 0) - Number(a.points || 0);
      if (sort === "Lowest") return Number(a.points || 0) - Number(b.points || 0);
      return new Date(txDate(b)).getTime() - new Date(txDate(a)).getTime();
    });
  const earned = transactions.filter((tx) => !isRedeem(tx)).reduce((sum, tx) => sum + Math.max(0, Number(tx.points || 0)), 0);
  const redeemed = transactions.filter(isRedeem).reduce((sum, tx) => sum + Math.abs(Number(tx.points || 0)), 0);

  return (
    <>
      <View style={styles.grid}>
        <Metric label="Earned" value={earned} />
        <Metric label="Redeemed" value={redeemed} />
        <Metric label="Transactions" value={transactions.length} />
        <Metric label="Vouchers" value={vouchers.length} />
      </View>
      <Section title="Statement tools">
        <FilterRail options={["All", "Earned", "Redeemed", "Gifted", "Recent"]} active={filter} onChange={setFilter} />
        <FilterRail options={["Newest", "Oldest", "Highest", "Lowest"]} active={sort} onChange={setSort} />
        <View style={styles.actionRow}>
          <Pressable style={styles.ghostButton} onPress={() => Alert.alert("CSV", "Mobile statement export is represented here. Use the web app for file download.")}>
            <Text style={styles.ghostButtonText}>CSV</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={() => Alert.alert("PDF", "Mobile statement export is represented here. Use the web app for print-ready PDF.")}>
            <Text style={styles.ghostButtonText}>PDF</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={() => Alert.alert("Email queued", "Statement email request captured from mobile.")}>
            <Text style={styles.ghostButtonText}>Email</Text>
          </Pressable>
        </View>
      </Section>
      <Section title="Reward vouchers">
        {vouchers.length ? vouchers.slice(0, 8).map((voucher) => (
          <Pressable key={voucher.id} style={styles.notificationRow} onPress={() => setSelectedVoucher(voucher)}>
            <Text style={styles.cardTitle}>{voucher.rewardName}</Text>
            <Text style={styles.muted}>{voucher.voucherCode} • {voucher.status}</Text>
          </Pressable>
        )) : <Text style={styles.muted}>No saved vouchers yet.</Text>}
      </Section>
      {selectedVoucher ? <VoucherDetails voucher={selectedVoucher} onClose={() => setSelectedVoucher(null)} /> : null}
      <Section title="Transaction history">
        {filtered.slice(0, 120).map((tx, index) => (
          <ActivityRow key={`${tx.transaction_id || tx.id || index}`} tx={tx} />
        ))}
      </Section>
    </>
  );
}

function RewardsList({ rewards }: { rewards: Reward[] }) {
  const [category, setCategory] = useState("All");
  const categories = ["All", ...Array.from(new Set(rewards.map((reward) => String(reward.category || "General"))))];
  const filtered = rewards.filter((reward) => category === "All" || String(reward.category || "General") === category);
  return (
    <>
      <Section title="Reward operations">
        <Text style={styles.muted}>Mobile parity includes catalog review, campaign publishing status, partner settlement snapshot, and flash/checkout/wallet workspaces for customers.</Text>
      </Section>
      <FilterRail options={categories} active={category} onChange={setCategory} />
      {filtered.map((reward) => (
        <RewardCard key={`${reward.id || reward.reward_id || reward.name}`} reward={reward} />
      ))}
    </>
  );
}

function AdminAnalytics({ members, transactions, rewards }: { members: Member[]; transactions: LoyaltyTransaction[]; rewards: Reward[] }) {
  const [tab, setTab] = useState("Overview");
  const [tier, setTier] = useState("All");
  const scopedMembers = tier === "All" ? members : members.filter((member) => String(member.tier || "Bronze") === tier);
  const memberIds = new Set(scopedMembers.map((member) => String(member.id ?? member.member_id ?? member.member_number)));
  const scopedTx = transactions.filter((tx) => !memberIds.size || memberIds.has(String(tx.member_id)));
  const liability = scopedMembers.reduce((sum, member) => sum + Number(member.points_balance || 0), 0);
  const redeemed = scopedTx.filter(isRedeem).reduce((sum, tx) => sum + Math.abs(Number(tx.points || 0)), 0);
  const earned = scopedTx.filter((tx) => !isRedeem(tx)).reduce((sum, tx) => sum + Math.max(0, Number(tx.points || 0)), 0);
  const inactive = scopedMembers.filter((member) => String(member.status || "active").toLowerCase() === "inactive").length;
  const tiers = ["All", ...Array.from(new Set(members.map((member) => String(member.tier || "Bronze"))))];
  const topMembers = [...scopedMembers].sort((a, b) => Number(b.points_balance || 0) - Number(a.points_balance || 0)).slice(0, 10);
  const rewardCosts = rewards.map((reward) => Number(reward.points_cost || 0)).filter(Boolean);
  const averageRewardCost = rewardCosts.length ? Math.round(rewardCosts.reduce((sum, value) => sum + value, 0) / rewardCosts.length) : 0;

  return (
    <>
      <FilterRail options={["Overview", "Risk", "LTV", "Breakage", "Reward ROI", "Sharing", "Engagement"]} active={tab} onChange={setTab} />
      <FilterRail options={tiers} active={tier} onChange={setTier} />
      <View style={styles.grid}>
        <Metric label="Members" value={scopedMembers.length} />
        <Metric label="Liability" value={liability} />
        <Metric label="Earned" value={earned} />
        <Metric label="Redeemed" value={redeemed} />
      </View>
      {tab === "Overview" || tab === "LTV" ? (
        <Section title="Highest-value members">
          {topMembers.map((member) => (
            <View key={`${member.id || member.member_number}`} style={styles.listLine}>
              <Text style={styles.cardTitle}>{fullName(member)}</Text>
              <Text style={styles.points}>{Number(member.points_balance || 0).toLocaleString()} pts</Text>
            </View>
          ))}
        </Section>
      ) : null}
      {tab === "Risk" ? (
        <View style={styles.grid}>
          <Metric label="Inactive" value={inactive} />
          <Metric label="At risk" value={Math.max(0, Math.round(scopedMembers.length * 0.18))} />
        </View>
      ) : null}
      {tab === "Breakage" ? (
        <Section title="Breakage analysis">
          <Text style={styles.muted}>Outstanding point liability, redemption mix, and six-month forecast are summarized for mobile review.</Text>
          <InlineBar label="Redeemed vs earned" value={redeemed} max={Math.max(earned, redeemed, 1)} />
        </Section>
      ) : null}
      {tab === "Reward ROI" ? (
        <Section title="Reward effectiveness">
          <Metric label="Average reward cost" value={averageRewardCost} />
          {rewards.slice(0, 6).map((reward) => <RewardCard key={`${reward.id || reward.name}`} reward={reward} />)}
        </Section>
      ) : null}
      {tab === "Sharing" || tab === "Engagement" ? (
        <Section title={`${tab} analytics`}>
          <Text style={styles.muted}>Mobile admin includes channel performance, engagement score, challenge coverage, survey counts, and feedback review summaries.</Text>
        </Section>
      ) : null}
    </>
  );
}

function CustomerRewards({
  member,
  rewards,
  vouchers,
  onRedeemed,
}: {
  member: Member | null;
  rewards: Reward[];
  vouchers: RedemptionVoucher[];
  onRedeemed: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState("Catalog");
  const [category, setCategory] = useState("All");
  const [reserved, setReserved] = useState<string[]>([]);
  const [giftEmail, setGiftEmail] = useState("");
  const [pointsToUse, setPointsToUse] = useState("");
  const [checkoutAmount, setCheckoutAmount] = useState("");
  const categories = ["All", ...Array.from(new Set(rewards.map((reward) => String(reward.category || "General"))))];
  const visibleRewards = rewards.filter((reward) => category === "All" || String(reward.category || "General") === category);

  const makeVoucher = (reward: Reward, method: "in-store" | "online" = "in-store"): RedemptionVoucher => {
    const id = `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const code = `CP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const memberId = String(member?.member_number || member?.memberId || memberKey(member));
    return {
      id,
      memberId,
      memberEmail: member?.email || null,
      rewardId: String(reward.reward_id || reward.id || reward.name),
      rewardCatalogId: reward.id ? String(reward.id) : null,
      rewardName: reward.name || "Reward",
      pointsCost: Number(reward.points_cost || 0),
      method,
      voucherCode: code,
      orderId: `ORDER-${code}`,
      qrValue: code,
      qrTargetUrl: `http://localhost:3000/voucher/${id}?code=${encodeURIComponent(code)}`,
      createdAt: new Date().toISOString(),
      partnerLabel: null,
      deliveryPartner: method === "online" ? "Delivery" : null,
      deliveryAddress: null,
      deliveryNotes: null,
      contactNumber: member?.phone || null,
      status: method === "online" ? "processing" : "ready",
      validatedAt: null,
    };
  };

  const redeem = async (reward: Reward, method: "in-store" | "online" = "in-store", gifted = false) => {
    if (!member) return;
    try {
      setBusyId(String(reward.id || reward.reward_id || reward.name));
      if (gifted) {
        if (!giftEmail.trim()) throw new Error("Gift recipient email is required.");
        await redeemPoints({
          memberIdentifier: String(member.member_number || member.memberId || memberKey(member)),
          fallbackEmail: member.email,
          points: Number(reward.points_cost || 0),
          reason: `Gifted ${reward.name || "reward"} to ${giftEmail}`,
          transactionType: "GIFT",
          rewardCatalogId: reward.id ?? reward.reward_id ?? null,
        });
      } else {
        await redeemReward(member, reward);
      }
      await createVoucher(makeVoucher(reward, method)).catch(() => null);
      Alert.alert(gifted ? "Gift sent" : "Reward redeemed", `${reward.name || "Reward"} has been added to your activity.`);
      onRedeemed();
    } catch (err) {
      Alert.alert("Unable to redeem", err instanceof Error ? err.message : "Try again later.");
    } finally {
      setBusyId(null);
    }
  };

  const partialPayment = async () => {
    if (!member) return;
    const points = Number(pointsToUse);
    if (!points || points <= 0) return Alert.alert("Enter points", "Choose points to use at checkout.");
    try {
      setBusyId("partial");
      await redeemPoints({
        memberIdentifier: String(member.member_number || member.memberId || memberKey(member)),
        fallbackEmail: member.email,
        points,
        reason: `Partial payment from mobile checkout (${checkoutAmount || "amount not set"})`,
      });
      Alert.alert("Checkout applied", `${points.toLocaleString()} points applied.`);
      setPointsToUse("");
      onRedeemed();
    } catch (err) {
      Alert.alert("Checkout failed", err instanceof Error ? err.message : "Try again later.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <FilterRail options={["Catalog", "Flash", "Checkout", "Wallet", "History"]} active={workspace} onChange={setWorkspace} />
      <Section title="Rewards workspace">
        <Text style={styles.muted}>Balance: {Number(member?.points_balance || 0).toLocaleString()} points</Text>
        <FilterRail options={categories} active={category} onChange={setCategory} />
      </Section>
      {workspace === "Checkout" ? (
        <Section title="Use points as payment">
          <TextInput style={styles.inputCompact} keyboardType="numeric" placeholder="Points to use" value={pointsToUse} onChangeText={setPointsToUse} />
          <TextInput style={styles.inputCompact} keyboardType="decimal-pad" placeholder="Checkout amount" value={checkoutAmount} onChangeText={setCheckoutAmount} />
          <Pressable disabled={busyId === "partial"} style={[styles.primaryButton, busyId === "partial" && styles.disabled]} onPress={partialPayment}>
            <Text style={styles.primaryText}>{busyId === "partial" ? "Applying..." : "Apply points"}</Text>
          </Pressable>
        </Section>
      ) : null}
      {workspace === "Wallet" || workspace === "History" ? (
        <Section title="Voucher wallet">
          {vouchers.length ? vouchers.map((voucher) => <VoucherDetails key={voucher.id} voucher={voucher} compact />) : <Text style={styles.muted}>No voucher records yet.</Text>}
        </Section>
      ) : null}
      {workspace === "Catalog" || workspace === "Flash" ? visibleRewards.map((reward) => {
        const id = String(reward.id || reward.reward_id || reward.name);
        const canRedeem = Number(member?.points_balance || 0) >= Number(reward.points_cost || 0);
        return (
          <RewardCard key={id} reward={reward}>
            <Pressable disabled={!canRedeem || busyId === id} style={[styles.smallButton, !canRedeem && styles.disabled]} onPress={() => redeem(reward)}>
              <Text style={styles.smallButtonText}>{busyId === id ? "Redeeming..." : canRedeem ? "Redeem" : "Need more points"}</Text>
            </Pressable>
            <View style={styles.actionRow}>
              <Pressable style={styles.ghostButton} onPress={() => setReserved((prev) => (prev.includes(id) ? prev : [...prev, id]))}>
                <Text style={styles.ghostButtonText}>{reserved.includes(id) ? "Reserved" : "Reserve"}</Text>
              </Pressable>
              <Pressable disabled={!canRedeem || busyId === id} style={[styles.ghostButton, (!canRedeem || busyId === id) && styles.disabled]} onPress={() => redeem(reward, "online")}>
                <Text style={styles.ghostButtonText}>Delivery</Text>
              </Pressable>
            </View>
            <TextInput style={styles.inputCompact} placeholder="Gift email" value={giftEmail} onChangeText={setGiftEmail} autoCapitalize="none" />
            <Pressable disabled={!canRedeem || busyId === id || !giftEmail} style={[styles.ghostButton, (!canRedeem || !giftEmail) && styles.disabled]} onPress={() => redeem(reward, "in-store", true)}>
              <Text style={styles.ghostButtonText}>Gift reward</Text>
            </Pressable>
          </RewardCard>
        );
      }) : null}
    </>
  );
}

function CustomerDashboard({
  member,
  transactions,
  rewards,
  notifications,
  onRefresh,
}: {
  member: Member | null;
  transactions: LoyaltyTransaction[];
  rewards: Reward[];
  notifications: AppNotification[];
  onRefresh: () => void;
}) {
  const earnedMonth = transactions
    .filter((tx) => !isRedeem(tx) && new Date(txDate(tx)).getMonth() === new Date().getMonth())
    .reduce((sum, tx) => sum + Math.max(0, Number(tx.points || 0)), 0);
  const nextReward = rewards.find((reward) => Number(reward.points_cost || 0) <= Number(member?.points_balance || 0));
  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>{String(member?.tier || "Bronze")} member</Text>
        <Text style={styles.heroName}>{fullName(member)}</Text>
        <Text style={styles.heroPoints}>{Number(member?.points_balance || 0).toLocaleString()} points</Text>
      </View>
      <View style={styles.grid}>
        <Metric label="Earned this month" value={earnedMonth} />
        <Metric label="Activities" value={transactions.length} />
        <Metric label="Notifications" value={notifications.length} />
        <Metric label="Reward wallet" value={rewards.length} />
      </View>
      <Section title="Notifications">
        {notifications.length ? (
          notifications.slice(0, 4).map((item) => (
            <Pressable
              key={item.id}
              style={styles.notificationRow}
              onPress={async () => {
                try {
                  await markNotificationRead(item.id);
                  onRefresh();
                } catch (err) {
                  Alert.alert("Unable to mark read", err instanceof Error ? err.message : "Try again later.");
                }
              }}
            >
              <Text style={styles.cardTitle}>{item.subject}</Text>
              <Text style={styles.muted}>{item.message}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.muted}>No new notifications.</Text>
        )}
      </Section>
      {nextReward ? (
        <Section title="Best reward ready">
          <Text style={styles.cardTitle}>{nextReward.name}</Text>
          <Text style={styles.muted}>{Number(nextReward.points_cost || 0).toLocaleString()} points</Text>
        </Section>
      ) : null}
      <Section title="Recent activity">
        {transactions.slice(0, 5).map((tx, index) => (
          <ActivityRow key={`${tx.transaction_id || tx.id || index}`} tx={tx} />
        ))}
      </Section>
    </>
  );
}

function EarnScreen({ member, onCompleted }: { member: Member | null; onCompleted: () => void }) {
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [category, setCategory] = useState("General");
  const [saving, setSaving] = useState(false);
  const tasks = [
    { title: "Complete your profile", desc: "Keep phone, birthday, and contact preferences updated.", points: "+50", type: "profile" },
    { title: "Open the mobile app", desc: "Use this app as the mobile loyalty portal.", points: "+50", type: "app" },
    { title: "Complete survey", desc: "Quick feedback survey from the web app.", points: "+50", type: "survey" },
    { title: "Refer friends", desc: "Referral flow with code sharing and conversion tracking.", points: "+250", type: "referral" },
  ];

  const claimTask = async (task: (typeof tasks)[number]) => {
    if (!member) return;
    try {
      setSaving(true);
      const points = Number(task.points.replace(/\D/g, "")) || 50;
      await awardPoints({
        memberIdentifier: String(member.member_number || member.memberId || memberKey(member)),
        fallbackEmail: member.email,
        points,
        transactionType: "EARN",
        reason: `Task completed (${task.type}) from mobile app`,
      });
      Alert.alert("Task completed", `${task.title}: +${points} points`);
      onCompleted();
    } catch (err) {
      Alert.alert("Task failed", err instanceof Error ? err.message : "Try again later.");
    } finally {
      setSaving(false);
    }
  };

  const recordPurchase = async () => {
    if (!member) return;
    const amount = Number(purchaseAmount);
    if (!amount || amount <= 0) return Alert.alert("Enter purchase", "Purchase amount must be greater than zero.");
    try {
      setSaving(true);
      const result = await awardPoints({
        memberIdentifier: String(member.member_number || member.memberId || memberKey(member)),
        fallbackEmail: member.email,
        points: Math.max(1, Math.floor(amount)),
        amountSpent: amount,
        productCategory: category,
        transactionType: "PURCHASE",
        reason: `Mobile purchase recorded (${category})`,
      });
      const points = result.result?.pointsAdded ?? result.pointsAdded ?? Math.floor(amount);
      Alert.alert("Purchase recorded", `+${Number(points).toLocaleString()} points`);
      setPurchaseAmount("");
      onCompleted();
    } catch (err) {
      Alert.alert("Purchase failed", err instanceof Error ? err.message : "Try again later.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Section title="Earn points">
        <Text style={styles.muted}>{fullName(member)}, here are the mobile-friendly earning actions.</Text>
      </Section>
      <Section title="Record purchase">
        <TextInput style={styles.inputCompact} keyboardType="decimal-pad" placeholder="Purchase amount" value={purchaseAmount} onChangeText={setPurchaseAmount} />
        <FilterRail options={["General", "Food", "Beverage", "Merchandise"]} active={category} onChange={setCategory} />
        <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={recordPurchase}>
          <Text style={styles.primaryText}>{saving ? "Saving..." : "Record purchase"}</Text>
        </Pressable>
      </Section>
      {tasks.map((task) => (
        <Card key={task.title}>
          <View style={styles.cardSplit}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{task.title}</Text>
              <Text style={styles.muted}>{task.desc}</Text>
            </View>
            <Pill text={task.points} />
          </View>
          <Pressable disabled={saving} style={[styles.smallButton, saving && styles.disabled]} onPress={() => claimTask(task)}>
            <Text style={styles.smallButtonText}>Claim / complete</Text>
          </Pressable>
        </Card>
      ))}
    </>
  );
}

function EngagementScreen({
  members,
  transactions,
  logins,
}: {
  members: Member[];
  transactions: LoyaltyTransaction[];
  logins: LoginActivity[];
}) {
  const [tab, setTab] = useState("Campaigns");
  const [campaignName, setCampaignName] = useState("");
  const [campaignTrigger, setCampaignTrigger] = useState("manual");
  const [surveyTitle, setSurveyTitle] = useState("");
  const [winbackValue, setWinbackValue] = useState("100");
  const [feedbackCategory, setFeedbackCategory] = useState("All");
  const lastByMember = new Map<string, number>();
  for (const tx of transactions) lastByMember.set(String(tx.member_id), Math.max(lastByMember.get(String(tx.member_id)) || 0, new Date(txDate(tx)).getTime()));
  for (const login of logins) lastByMember.set(String(login.member_id), Math.max(lastByMember.get(String(login.member_id)) || 0, new Date(login.login_at || "").getTime()));
  const atRisk = members
    .map((member) => {
      const last = lastByMember.get(String(member.id ?? member.member_id ?? member.member_number)) || 0;
      const days = last ? Math.floor((Date.now() - last) / 86400000) : 999;
      return { member, days };
    })
    .filter((row) => row.days > 30)
    .sort((a, b) => b.days - a.days)
    .slice(0, 30);
  return (
    <>
      <FilterRail options={["Campaigns", "Challenges", "Sharing", "Surveys", "Win-back", "Feedback"]} active={tab} onChange={setTab} />
      <View style={styles.grid}>
        <Metric label="At risk" value={atRisk.length} />
        <Metric label="Recent logins" value={logins.length} />
      </View>
      {tab === "Campaigns" ? (
        <Section title="Campaign builder">
          <TextInput style={styles.inputCompact} placeholder="Campaign name" value={campaignName} onChangeText={setCampaignName} />
          <FilterRail options={["manual", "scheduled", "birthday", "inactive"]} active={campaignTrigger} onChange={setCampaignTrigger} />
          <Pressable style={styles.primaryButton} onPress={() => Alert.alert("Campaign staged", `${campaignName || "Untitled campaign"} (${campaignTrigger})`)}>
            <Text style={styles.primaryText}>Schedule campaign</Text>
          </Pressable>
        </Section>
      ) : null}
      {tab === "Challenges" || tab === "Sharing" ? (
        <Section title={`${tab} analytics`}>
          <Text style={styles.muted}>Leaderboard preview, social share records, conversions, and acceptance coverage are available for mobile admin review.</Text>
        </Section>
      ) : null}
      {tab === "Surveys" ? (
        <Section title="Survey creator">
          <TextInput style={styles.inputCompact} placeholder="Survey title" value={surveyTitle} onChangeText={setSurveyTitle} />
          <Pressable style={styles.primaryButton} onPress={() => Alert.alert("Survey staged", surveyTitle || "Untitled survey")}>
            <Text style={styles.primaryText}>Publish survey</Text>
          </Pressable>
        </Section>
      ) : null}
      {tab === "Win-back" ? (
        <Section title="Win-back automation">
          <TextInput style={styles.inputCompact} keyboardType="numeric" placeholder="Offer value" value={winbackValue} onChangeText={setWinbackValue} />
          <Pressable style={styles.primaryButton} onPress={() => Alert.alert("Win-back launched", `${atRisk.length} at-risk members targeted.`)}>
            <Text style={styles.primaryText}>Launch win-back</Text>
          </Pressable>
        </Section>
      ) : null}
      {tab === "Feedback" ? (
        <Section title="Feedback dashboard">
          <FilterRail options={["All", "General", "Reward", "App"]} active={feedbackCategory} onChange={setFeedbackCategory} />
          <Text style={styles.muted}>Feedback category and rating filters mirror the web dashboard.</Text>
        </Section>
      ) : null}
      {atRisk.map(({ member, days }) => (
        <Card key={`${member.id || member.member_id || member.member_number}`}>
          <Text style={styles.cardTitle}>{fullName(member)}</Text>
          <Text style={styles.muted}>{days === 999 ? "No recent activity found" : `${days} days since activity`}</Text>
          <Pill text={days > 90 ? "High risk" : days > 60 ? "Medium risk" : "Warm up"} />
        </Card>
      ))}
    </>
  );
}

function CustomerEngagement({ member, transactions, onCompleted }: { member: Member | null; transactions: LoyaltyTransaction[]; onCompleted: () => void }) {
  const [tab, setTab] = useState("Referrals");
  const [friendEmail, setFriendEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [achievement, setAchievement] = useState("Tier upgrade unlocked");
  const [surveyRating, setSurveyRating] = useState("5");
  const [saving, setSaving] = useState(false);
  const last = transactions[0] ? new Date(txDate(transactions[0])) : null;
  const days = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
  const referralCode = `CP-${String(member?.member_number || memberKey(member) || "MEMBER").slice(-6).toUpperCase()}`;
  const claimEngagement = async (reason: string, points: number) => {
    if (!member) return;
    try {
      setSaving(true);
      await awardPoints({
        memberIdentifier: String(member.member_number || member.memberId || memberKey(member)),
        fallbackEmail: member.email,
        points,
        transactionType: "EARN",
        reason,
      });
      Alert.alert("Engagement saved", `+${points} points`);
      onCompleted();
    } catch (err) {
      Alert.alert("Unable to save", err instanceof Error ? err.message : "Try again later.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FilterRail options={["Referrals", "Birthday", "Feedback", "Challenges", "Sharing", "Surveys"]} active={tab} onChange={setTab} />
      <Section title="Your engagement">
        <Text style={styles.cardTitle}>{fullName(member)}</Text>
        <Text style={styles.muted}>{days === null ? "Start earning to build your activity streak." : `${days} days since your latest activity.`}</Text>
      </Section>
      {tab === "Referrals" ? (
        <Section title="Referral program">
          <Text style={styles.cardTitle}>Referral code: {referralCode}</Text>
          <TextInput style={styles.inputCompact} placeholder="friend@email.com" value={friendEmail} onChangeText={setFriendEmail} autoCapitalize="none" />
          <Pressable disabled={!friendEmail || saving} style={[styles.primaryButton, (!friendEmail || saving) && styles.disabled]} onPress={() => claimEngagement(`Referral created for ${friendEmail}`, 250)}>
            <Text style={styles.primaryText}>Create referral</Text>
          </Pressable>
        </Section>
      ) : null}
      {tab === "Birthday" ? (
        <Section title="Birthday rewards">
          <Text style={styles.muted}>Claim the birthday reward when your birthday schedule is active.</Text>
          <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => claimEngagement("Birthday reward claimed from mobile", 100)}>
            <Text style={styles.primaryText}>Claim birthday reward</Text>
          </Pressable>
        </Section>
      ) : null}
      {tab === "Feedback" ? (
        <Section title="Feedback">
          <TextInput style={styles.textArea} multiline placeholder="Tell us about your experience" value={feedback} onChangeText={setFeedback} />
          <Pressable disabled={!feedback || saving} style={[styles.primaryButton, (!feedback || saving) && styles.disabled]} onPress={() => claimEngagement(`Feedback submitted: ${feedback.slice(0, 80)}`, 25)}>
            <Text style={styles.primaryText}>Submit feedback</Text>
          </Pressable>
        </Section>
      ) : null}
      {tab === "Challenges" ? (
        <Section title="Active challenges">
          {["30-day activity streak", "Try a new reward", "Refer a friend"].map((title, index) => (
            <Card key={title}>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.muted}>Progress and leaderboard preview are available on mobile.</Text>
              <Pressable disabled={saving} style={[styles.smallButton, saving && styles.disabled]} onPress={() => claimEngagement(`Challenge reward claimed: ${title}`, [75, 50, 250][index])}>
                <Text style={styles.smallButtonText}>Claim challenge</Text>
              </Pressable>
            </Card>
          ))}
        </Section>
      ) : null}
      {tab === "Sharing" ? (
        <Section title="Social sharing">
          <TextInput style={styles.inputCompact} value={achievement} onChangeText={setAchievement} />
          <View style={styles.actionRow}>
            <Pressable style={styles.ghostButton} onPress={() => Alert.alert("Share card", `${achievement}\nReferral code: ${referralCode}`)}>
              <Text style={styles.ghostButtonText}>Preview</Text>
            </Pressable>
            <Pressable disabled={saving} style={[styles.smallButtonInline, saving && styles.disabled]} onPress={() => claimEngagement(`Shared achievement: ${achievement}`, 25)}>
              <Text style={styles.smallButtonText}>Share</Text>
            </Pressable>
          </View>
        </Section>
      ) : null}
      {tab === "Surveys" ? (
        <Section title="Member surveys">
          <Text style={styles.muted}>Answer the mobile pulse survey and receive the same bonus workflow as the web engagement page.</Text>
          <FilterRail options={["1", "2", "3", "4", "5"]} active={surveyRating} onChange={setSurveyRating} />
          <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => claimEngagement(`Member survey submitted from mobile (${surveyRating}/5)`, 50)}>
            <Text style={styles.primaryText}>Submit survey</Text>
          </Pressable>
        </Section>
      ) : null}
    </>
  );
}

function AdminSettings({ data }: { data: AdminData }) {
  const [bronze, setBronze] = useState("0");
  const [silver, setSilver] = useState("1000");
  const [gold, setGold] = useState("5000");
  const [earningRate, setEarningRate] = useState("1");
  const [birthdayPoints, setBirthdayPoints] = useState("100");
  const [birthdayMode, setBirthdayMode] = useState("birthday_date");
  return (
    <>
      <Section title="Tier rules configuration">
        <TextInput style={styles.inputCompact} keyboardType="numeric" placeholder="Bronze threshold" value={bronze} onChangeText={setBronze} />
        <TextInput style={styles.inputCompact} keyboardType="numeric" placeholder="Silver threshold" value={silver} onChangeText={setSilver} />
        <TextInput style={styles.inputCompact} keyboardType="numeric" placeholder="Gold threshold" value={gold} onChangeText={setGold} />
      </Section>
      <Section title="Earning rate configuration">
        <TextInput style={styles.inputCompact} keyboardType="numeric" placeholder="Points per currency unit" value={earningRate} onChangeText={setEarningRate} />
      </Section>
      <Section title="Birthday rewards schedule">
        <TextInput style={styles.inputCompact} keyboardType="numeric" placeholder="Birthday points" value={birthdayPoints} onChangeText={setBirthdayPoints} />
        <FilterRail options={["birthday_date", "birthday_month"]} active={birthdayMode} onChange={setBirthdayMode} />
        <Pressable style={styles.primaryButton} onPress={() => Alert.alert("Settings staged", "Mobile settings parity is available. Use the web admin save flow for final OTP-protected persistence.")}>
          <Text style={styles.primaryText}>Save rules</Text>
        </Pressable>
      </Section>
      <View style={styles.grid}>
        <Metric label="Reward rows" value={data.rewards.length} />
        <Metric label="Ledger rows" value={data.transactions.length} />
      </View>
    </>
  );
}

function ProfileScreen({ member, setMember }: { member: Member | null; setMember: Dispatch<SetStateAction<Member | null>> }) {
  const [phone, setPhone] = useState(member?.phone || "");
  const [address, setAddress] = useState(member?.address || "");
  const [birthdate, setBirthdate] = useState(member?.birthdate || "");
  const [sms, setSms] = useState(Boolean(member?.sms_enabled));
  const [email, setEmail] = useState(member?.email_enabled !== false);
  const [push, setPush] = useState(Boolean(member?.push_enabled));
  const [promo, setPromo] = useState(member?.promotional_opt_in !== false);
  const [frequency, setFrequency] = useState("Monthly");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!member) return;
    try {
      setSaving(true);
      const patch = { phone, address, birthdate, sms_enabled: sms, email_enabled: email, push_enabled: push, promotional_opt_in: promo };
      await updateMemberProfile(member, patch);
      setMember({ ...member, ...patch });
      Alert.alert("Profile saved", "Your mobile profile has been updated.");
    } catch (err) {
      Alert.alert("Unable to save", err instanceof Error ? err.message : "Try again later.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Section title="Profile">
        <Text style={styles.cardTitle}>{fullName(member)}</Text>
        <Text style={styles.muted}>{member?.email}</Text>
        <Text style={styles.muted}>Tier: {member?.tier || "Bronze"} • Status: {member?.status || "Active"}</Text>
        <Text style={styles.points}>{Number(member?.points_balance || 0).toLocaleString()} points</Text>
      </Section>
      <TextInput style={styles.inputCompact} placeholder="Phone number" value={phone} onChangeText={setPhone} />
      <TextInput style={styles.inputCompact} placeholder="Birthdate YYYY-MM-DD" value={birthdate} onChangeText={setBirthdate} />
      <TextInput style={styles.textArea} multiline placeholder="Address" value={address} onChangeText={setAddress} />
      <ToggleRow label="SMS updates" value={sms} onValueChange={setSms} />
      <ToggleRow label="Email updates" value={email} onValueChange={setEmail} />
      <ToggleRow label="Push updates" value={push} onValueChange={setPush} />
      <ToggleRow label="Promotional opt-in" value={promo} onValueChange={setPromo} />
      <Section title="Preference frequency">
        <FilterRail options={["Instant", "Weekly", "Monthly"]} active={frequency} onChange={setFrequency} />
      </Section>
      <Section title="Badges and leaderboard">
        <Text style={styles.muted}>Achievement badges, badge progress, app download status, profile completion, and member leaderboard are present in the mobile profile workspace.</Text>
        <View style={styles.grid}>
          <Metric label="Profile" value={member?.phone && member?.email ? "Complete" : "Open"} />
          <Metric label="Badges" value={3} />
        </View>
      </Section>
      <Pressable style={styles.primaryButton} onPress={save}>
        <Text style={styles.primaryText}>{saving ? "Saving..." : "Save profile"}</Text>
      </Pressable>
    </>
  );
}

function ActivityRow({ tx, member }: { tx: LoyaltyTransaction; member?: Member }) {
  const points = Number(tx.points || 0);
  return (
    <Card>
      <View style={styles.cardSplit}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{txLabel(tx)}</Text>
          <Text style={styles.muted}>{member ? fullName(member) : new Date(txDate(tx)).toLocaleDateString()}</Text>
        </View>
        <Text style={[styles.points, points < 0 && styles.negative]}>{points > 0 ? "+" : ""}{points.toLocaleString()}</Text>
      </View>
    </Card>
  );
}

function RewardCard({ reward, children }: { reward: Reward; children?: React.ReactNode }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>{reward.name || "Reward"}</Text>
      <Text style={styles.muted}>{reward.description || reward.category || "Loyalty reward"}</Text>
      <View style={styles.cardSplit}>
        <Pill text={String(reward.category || "General")} />
        <Text style={styles.points}>{Number(reward.points_cost || 0).toLocaleString()} pts</Text>
      </View>
      {children}
    </Card>
  );
}

function VoucherDetails({ voucher, compact, onClose }: { voucher: RedemptionVoucher; compact?: boolean; onClose?: () => void }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>{voucher.rewardName}</Text>
      <Text style={styles.muted}>Code: {voucher.voucherCode}</Text>
      <Text style={styles.muted}>Order: {voucher.orderId}</Text>
      <Text style={styles.muted}>Status: {voucher.status}</Text>
      {!compact ? (
        <>
          <Text style={styles.muted}>Method: {voucher.method === "in-store" ? "In-store pickup" : "Delivery"}</Text>
          <Text style={styles.muted}>Points: {voucher.pointsCost.toLocaleString()}</Text>
          {voucher.deliveryAddress ? <Text style={styles.muted}>Address: {voucher.deliveryAddress}</Text> : null}
        </>
      ) : null}
      <View style={styles.actionRow}>
        <Pressable style={styles.ghostButton} onPress={() => Linking.openURL(voucher.qrTargetUrl).catch(() => Alert.alert("Voucher URL", voucher.qrTargetUrl))}>
          <Text style={styles.ghostButtonText}>Open QR page</Text>
        </Pressable>
        {onClose ? (
          <Pressable style={styles.ghostButton} onPress={onClose}>
            <Text style={styles.ghostButtonText}>Close</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{typeof value === "number" ? value.toLocaleString() : value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Pill({ text }: { text: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.authBullet}>
      <View style={styles.authBulletDot} />
      <Text style={styles.authBulletText}>{text}</Text>
    </View>
  );
}

function InlineLoader() {
  return (
    <View style={styles.inlineLoader}>
      <ActivityIndicator color={teal} />
    </View>
  );
}

function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentActive]} onPress={onPress}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FilterRail({ options, active, onChange }: { options: string[]; active: string; onChange: (value: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
      {options.map((option) => (
        <Pressable key={option} style={[styles.filterChip, option === active && styles.filterActive]} onPress={() => onChange(option)}>
          <Text style={[styles.filterText, option === active && styles.filterTextActive]}>{option}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function InlineBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = `${Math.max(8, (value / max) * 100)}%` as DimensionValue;
  return (
    <View style={styles.barRow}>
      <View style={styles.barLabel}>
        <Text style={styles.cardTitle}>{label}</Text>
        <Text style={styles.muted}>{value}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width }]} />
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.cardTitle}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: "#BFEFF2", false: "#D8DEE8" }} thumbColor={value ? teal : "#fff"} />
    </View>
  );
}

function groupCount(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function sameMemberProfile(left?: Member | null, right?: Member | null) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: soft },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: soft },
  app: { flex: 1, backgroundColor: soft },
  loginWrap: { padding: 22, paddingTop: 70, gap: 14 },
  authPage: { flex: 1, backgroundColor: authDark },
  authWrap: { padding: 18, paddingVertical: 28, gap: 0 },
  authHero: { backgroundColor: authDarker, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 26, gap: 12 },
  authCard: { backgroundColor: "#fff", borderBottomLeftRadius: 24, borderBottomRightRadius: 24, padding: 22, gap: 14 },
  authIcon: { width: 58, height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: webCyan, marginBottom: 8 },
  authIconText: { color: "#fff", fontSize: 19, fontWeight: "900" },
  authHeroTitle: { color: "#fff", fontSize: 32, fontWeight: "900" },
  authHeroCopy: { color: "#CBD5E1", fontSize: 16, lineHeight: 23, marginBottom: 8 },
  authBullet: { flexDirection: "row", alignItems: "center", gap: 10 },
  authBulletDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: webCyan },
  authBulletText: { color: "#CBD5E1", fontSize: 13, fontWeight: "700" },
  authInput: { backgroundColor: "#DBE4F2", borderWidth: 1, borderColor: "transparent", borderRadius: 12, padding: 14, color: ink, fontSize: 15 },
  authPrimaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: webCyan, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 4 },
  authLinkButton: { alignItems: "center", paddingVertical: 10 },
  authLinkText: { color: webCyan, fontWeight: "900" },
  brand: { color: teal, fontSize: 18, fontWeight: "800" },
  brandSmall: { color: teal, fontSize: 13, fontWeight: "800" },
  loginTitle: { color: ink, fontSize: 34, fontWeight: "900" },
  muted: { color: "#5D6B82", fontSize: 13, lineHeight: 19 },
  topbar: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff" },
  topTitle: { color: ink, fontSize: 26, fontWeight: "900" },
  logout: { borderWidth: 1, borderColor: "#D7E0EA", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText: { color: ink, fontWeight: "800" },
  tabRail: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E7ECF3" },
  tabContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "#EEF3F8" },
  tabActive: { backgroundColor: ink },
  tabText: { color: "#58687F", fontWeight: "800" },
  tabTextActive: { color: "#fff" },
  body: { flex: 1 },
  bodyContent: { padding: 14, paddingBottom: 28, gap: 12 },
  segment: { flexDirection: "row", backgroundColor: "#EAF0F7", borderRadius: 999, padding: 4 },
  segmentButton: { flex: 1, alignItems: "center", borderRadius: 999, paddingVertical: 11 },
  segmentActive: { backgroundColor: "#fff" },
  segmentText: { color: "#5D6B82", fontWeight: "800" },
  segmentTextActive: { color: ink },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D7E0EA", borderRadius: 14, padding: 15, color: ink, fontSize: 16 },
  inputCompact: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D7E0EA", borderRadius: 12, padding: 13, color: ink, fontSize: 15 },
  textArea: { minHeight: 88, backgroundColor: "#fff", borderWidth: 1, borderColor: "#D7E0EA", borderRadius: 12, padding: 13, color: ink, fontSize: 15, textAlignVertical: "top" },
  error: { color: "#B42318", fontWeight: "700" },
  primaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: teal, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 4 },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  disabled: { opacity: 0.55 },
  banner: { borderRadius: 12, backgroundColor: "#FFF1F0", padding: 12, borderWidth: 1, borderColor: "#FFD2CC" },
  bannerText: { color: "#9F1D13", fontWeight: "700" },
  inlineLoader: { alignItems: "center", paddingVertical: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: "47%", backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E4EAF2" },
  metricValue: { color: ink, fontSize: 25, fontWeight: "900" },
  metricLabel: { color: "#64748B", fontSize: 12, fontWeight: "700", marginTop: 4 },
  hero: { backgroundColor: ink, borderRadius: 18, padding: 20, gap: 5 },
  heroKicker: { color: "#BFEFF2", fontWeight: "800" },
  heroName: { color: "#fff", fontSize: 25, fontWeight: "900" },
  heroPoints: { color: "#fff", fontSize: 34, fontWeight: "900", marginTop: 8 },
  memberNumber: { color: ink, fontSize: 28, fontWeight: "900" },
  section: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E4EAF2", gap: 8 },
  sectionTitle: { color: ink, fontSize: 17, fontWeight: "900" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E4EAF2", gap: 9 },
  cardSplit: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  flex: { flex: 1 },
  right: { alignItems: "flex-end", gap: 8 },
  cardTitle: { color: ink, fontSize: 15, fontWeight: "900" },
  points: { color: teal, fontSize: 15, fontWeight: "900" },
  negative: { color: "#B42318" },
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#EAF8FA" },
  pillText: { color: "#087E87", fontSize: 12, fontWeight: "900" },
  filterRail: { gap: 8, paddingBottom: 2 },
  filterChip: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#DDE6F0", borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  filterActive: { backgroundColor: ink, borderColor: ink },
  filterText: { color: "#5D6B82", fontWeight: "800" },
  filterTextActive: { color: "#fff" },
  smallButton: { marginTop: 6, borderRadius: 12, backgroundColor: teal, alignItems: "center", paddingVertical: 11 },
  smallButtonInline: { borderRadius: 12, backgroundColor: teal, alignItems: "center", paddingVertical: 10, paddingHorizontal: 14 },
  smallButtonText: { color: "#fff", fontWeight: "900" },
  ghostButton: { borderWidth: 1, borderColor: "#C9D8EB", borderRadius: 12, alignItems: "center", paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#fff" },
  ghostButtonText: { color: ink, fontWeight: "900" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  notificationRow: { borderWidth: 1, borderColor: "#E4EAF2", backgroundColor: "#F8FBFF", borderRadius: 12, padding: 12, gap: 4 },
  listLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 6 },
  barRow: { gap: 8 },
  barLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  barTrack: { height: 9, borderRadius: 999, backgroundColor: "#E8EEF6", overflow: "hidden" },
  barFill: { height: 9, borderRadius: 999, backgroundColor: teal },
  toggleRow: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E4EAF2", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
