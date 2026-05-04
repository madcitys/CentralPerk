import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const PartnersScreen = () => (
  <View style={s.container}>
    <Ionicons name="business" size={48} color="#ffd460" />
    <Text style={s.title}>Partner Management</Text>
    <Text style={s.sub}>Manage retail partners and integrations.</Text>
  </View>
);

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#16213e',justifyContent:'center',alignItems:'center',padding:24},
  title:{fontSize:22,fontWeight:'800',color:'#e2e8f0',marginTop:16},
  sub:{fontSize:14,color:'#8892b0',marginTop:8,textAlign:'center'},
});
