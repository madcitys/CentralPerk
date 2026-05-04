import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const rewards = [
  { id:'1', title:'Free Latte', cost:'500 pts', icon:'cafe' as const },
  { id:'2', title:'$5 Off Next Order', cost:'750 pts', icon:'pricetag' as const },
  { id:'3', title:'Exclusive Mug', cost:'1,200 pts', icon:'beer' as const },
  { id:'4', title:'VIP Tasting Event', cost:'2,000 pts', icon:'wine' as const },
];

export const RewardsScreen = () => (
  <View style={s.container}>
    <Text style={s.title}>Available Rewards</Text>
    <FlatList
      data={rewards}
      keyExtractor={i=>i.id}
      numColumns={2}
      contentContainerStyle={s.list}
      columnWrapperStyle={s.row}
      renderItem={({item})=>(
        <View style={s.card}>
          <View style={s.iconWrap}><Ionicons name={item.icon} size={28} color="#ffd460" /></View>
          <Text style={s.name}>{item.title}</Text>
          <Text style={s.cost}>{item.cost}</Text>
        </View>
      )}
    />
  </View>
);

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#16213e',padding:20},
  title:{fontSize:20,fontWeight:'800',color:'#e2e8f0',marginBottom:16},
  list:{gap:12},row:{gap:12},
  card:{flex:1,backgroundColor:'#1a1a2e',borderRadius:14,padding:20,alignItems:'center'},
  iconWrap:{width:56,height:56,borderRadius:28,backgroundColor:'#2a2a4a',justifyContent:'center',alignItems:'center',marginBottom:12},
  name:{fontSize:14,fontWeight:'700',color:'#e2e8f0',textAlign:'center'},
  cost:{fontSize:12,color:'#e94560',fontWeight:'600',marginTop:4},
});
