import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const notifications = [
  { id:'1', title:'Double Points Active!', body:'Earn 2x on all purchases this weekend.', time:'2h ago', read:false },
  { id:'2', title:'New Reward Available', body:'You can now redeem the Exclusive Mug.', time:'1d ago', read:false },
  { id:'3', title:'Points Earned', body:'+50 points from your last purchase.', time:'2d ago', read:true },
  { id:'4', title:'Welcome!', body:'Thanks for joining the loyalty program.', time:'5d ago', read:true },
];

export const NotificationsScreen = () => (
  <View style={s.container}>
    <Text style={s.title}>Notifications</Text>
    <FlatList
      data={notifications}
      keyExtractor={i=>i.id}
      contentContainerStyle={s.list}
      renderItem={({item})=>(
        <View style={[s.card, !item.read && s.unread]}>
          <View style={s.dot}>{!item.read && <View style={s.dotInner}/>}</View>
          <View style={s.info}>
            <Text style={s.name}>{item.title}</Text>
            <Text style={s.body}>{item.body}</Text>
            <Text style={s.time}>{item.time}</Text>
          </View>
        </View>
      )}
    />
  </View>
);

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#16213e',padding:20},
  title:{fontSize:20,fontWeight:'800',color:'#e2e8f0',marginBottom:16},
  list:{gap:10},
  card:{backgroundColor:'#1a1a2e',borderRadius:14,padding:16,flexDirection:'row',alignItems:'flex-start'},
  unread:{borderLeftWidth:3,borderLeftColor:'#e94560'},
  dot:{width:10,marginTop:6,marginRight:10},
  dotInner:{width:8,height:8,borderRadius:4,backgroundColor:'#e94560'},
  info:{flex:1},
  name:{fontSize:15,fontWeight:'700',color:'#e2e8f0'},
  body:{fontSize:13,color:'#8892b0',marginTop:4},
  time:{fontSize:11,color:'#5a6380',marginTop:6},
});
