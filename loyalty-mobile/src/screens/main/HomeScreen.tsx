import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export const HomeScreen = () => {
  const { user } = useAuth();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.name}>{user?.name || 'Member'} 👋</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.stat}><Ionicons name="star" size={24} color="#e94560" /><Text style={styles.val}>1,250</Text><Text style={styles.lbl}>Points</Text></View>
        <View style={styles.stat}><Ionicons name="trophy" size={24} color="#4ecca3" /><Text style={styles.val}>Gold</Text><Text style={styles.lbl}>Tier</Text></View>
        <View style={styles.stat}><Ionicons name="gift" size={24} color="#ffd460" /><Text style={styles.val}>3</Text><Text style={styles.lbl}>Rewards</Text></View>
      </View>
      <View style={styles.section}>
        <Text style={styles.secTitle}>Recent Activity</Text>
        {['Coffee purchase +50 pts','Pastry reward redeemed','Bonus campaign +100 pts'].map((t,i)=>(
          <View key={i} style={styles.item}><Ionicons name="time-outline" size={18} color="#8892b0" /><Text style={styles.itemText}>{t}</Text></View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#16213e'},content:{padding:20},
  card:{backgroundColor:'#1a1a2e',borderRadius:16,padding:24,marginBottom:20},
  greeting:{fontSize:14,color:'#8892b0'},name:{fontSize:24,fontWeight:'800',color:'#e2e8f0',marginTop:4},
  row:{flexDirection:'row',gap:12,marginBottom:24},
  stat:{flex:1,backgroundColor:'#1a1a2e',borderRadius:14,padding:16,alignItems:'center'},
  val:{fontSize:20,fontWeight:'800',color:'#e2e8f0',marginTop:8},lbl:{fontSize:12,color:'#8892b0',marginTop:4},
  section:{backgroundColor:'#1a1a2e',borderRadius:16,padding:20},
  secTitle:{fontSize:16,fontWeight:'700',color:'#e2e8f0',marginBottom:16},
  item:{flexDirection:'row',alignItems:'center',paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#2a2a4a'},
  itemText:{color:'#a8b2d1',fontSize:14,marginLeft:12},
});
