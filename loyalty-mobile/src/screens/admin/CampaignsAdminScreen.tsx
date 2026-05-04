import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const campaigns = [
  { id:'1', name:'Double Points Weekend', status:'Active', members:234 },
  { id:'2', name:'Referral Bonus', status:'Active', members:89 },
  { id:'3', name:'Birthday Special', status:'Draft', members:0 },
];

export const CampaignsAdminScreen = ({ navigation }: any) => (
  <View style={s.container}>
    <FlatList
      data={campaigns}
      keyExtractor={i=>i.id}
      contentContainerStyle={s.list}
      ListHeaderComponent={<Text style={s.title}>Manage Campaigns</Text>}
      renderItem={({item})=>(
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.name}>{item.name}</Text>
            <View style={[s.badge,item.status==='Active'?s.active:s.draft]}>
              <Text style={[s.badgeText,item.status==='Active'?s.activeText:s.draftText]}>{item.status}</Text>
            </View>
          </View>
          <Text style={s.members}>{item.members} enrolled members</Text>
        </View>
      )}
    />
  </View>
);

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#16213e'},list:{padding:20,gap:12},
  title:{fontSize:20,fontWeight:'800',color:'#e2e8f0',marginBottom:16},
  card:{backgroundColor:'#1a1a2e',borderRadius:14,padding:16},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  name:{fontSize:15,fontWeight:'700',color:'#e2e8f0',flex:1},
  badge:{paddingHorizontal:10,paddingVertical:4,borderRadius:8},
  active:{backgroundColor:'rgba(78,204,163,0.15)'},draft:{backgroundColor:'rgba(138,150,176,0.15)'},
  badgeText:{fontSize:11,fontWeight:'700'},activeText:{color:'#4ecca3'},draftText:{color:'#8892b0'},
  members:{fontSize:12,color:'#8892b0',marginTop:8},
});
