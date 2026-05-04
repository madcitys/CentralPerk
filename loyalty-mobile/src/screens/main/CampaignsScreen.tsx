import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const campaigns = [
  { id:'1', title:'Double Points Weekend', desc:'Earn 2x points on all purchases', status:'Active', icon:'flame' as const },
  { id:'2', title:'Referral Bonus', desc:'Invite friends and earn 500 pts', status:'Active', icon:'people' as const },
  { id:'3', title:'Birthday Special', desc:'Free drink on your birthday month', status:'Upcoming', icon:'balloon' as const },
];

export const CampaignsScreen = () => (
  <View style={s.container}>
    <Text style={s.title}>Active Campaigns</Text>
    <FlatList
      data={campaigns}
      keyExtractor={i=>i.id}
      contentContainerStyle={s.list}
      renderItem={({item})=>(
        <View style={s.card}>
          <View style={s.iconWrap}><Ionicons name={item.icon} size={24} color="#e94560" /></View>
          <View style={s.info}>
            <Text style={s.name}>{item.title}</Text>
            <Text style={s.desc}>{item.desc}</Text>
          </View>
          <View style={[s.badge, item.status==='Active'?s.badgeActive:s.badgeUpcoming]}>
            <Text style={s.badgeText}>{item.status}</Text>
          </View>
        </View>
      )}
    />
  </View>
);

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#16213e',padding:20},
  title:{fontSize:20,fontWeight:'800',color:'#e2e8f0',marginBottom:16},
  list:{gap:12},
  card:{backgroundColor:'#1a1a2e',borderRadius:14,padding:16,flexDirection:'row',alignItems:'center'},
  iconWrap:{width:44,height:44,borderRadius:12,backgroundColor:'#2a2a4a',justifyContent:'center',alignItems:'center'},
  info:{flex:1,marginLeft:14},
  name:{fontSize:15,fontWeight:'700',color:'#e2e8f0'},
  desc:{fontSize:12,color:'#8892b0',marginTop:2},
  badge:{paddingHorizontal:10,paddingVertical:4,borderRadius:8},
  badgeActive:{backgroundColor:'rgba(78,204,163,0.15)'},
  badgeUpcoming:{backgroundColor:'rgba(255,212,96,0.15)'},
  badgeText:{fontSize:11,fontWeight:'700',color:'#4ecca3'},
});
