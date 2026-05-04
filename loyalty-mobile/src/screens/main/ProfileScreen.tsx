import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export const ProfileScreen = ({ navigation }: any) => {
  const { user, role, logout } = useAuth();

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <View style={s.avatar}>
          <Ionicons name="person" size={40} color="#e94560" />
        </View>
        <Text style={s.name}>{user?.name || 'Member'}</Text>
        <Text style={s.email}>{user?.email || ''}</Text>
        <View style={s.roleBadge}>
          <Text style={s.roleText}>{role === 'program_manager' ? '🛡️ Program Manager' : '⭐ Member'}</Text>
        </View>
      </View>

      {role === 'program_manager' && (
        <TouchableOpacity style={s.adminBtn} onPress={() => navigation.navigate('Admin')}>
          <Ionicons name="settings" size={22} color="#fff" />
          <Text style={s.adminText}>Admin Panel</Text>
          <Ionicons name="chevron-forward" size={20} color="#8892b0" style={s.chevron} />
        </TouchableOpacity>
      )}

      <View style={s.menu}>
        {['Edit Profile','Order History','Preferences','Help & Support'].map((item,i)=>(
          <TouchableOpacity key={i} style={s.menuItem}>
            <Text style={s.menuText}>{item}</Text>
            <Ionicons name="chevron-forward" size={18} color="#5a6380" />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color="#e94560" />
        <Text style={s.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#16213e'},content:{padding:20,alignItems:'center'},
  header:{alignItems:'center',marginBottom:24},
  avatar:{width:80,height:80,borderRadius:40,backgroundColor:'#1a1a2e',justifyContent:'center',alignItems:'center',marginBottom:12},
  name:{fontSize:22,fontWeight:'800',color:'#e2e8f0'},
  email:{fontSize:13,color:'#8892b0',marginTop:4},
  roleBadge:{backgroundColor:'#2a2a4a',borderRadius:20,paddingHorizontal:16,paddingVertical:6,marginTop:10},
  roleText:{color:'#e2e8f0',fontSize:13,fontWeight:'600'},
  adminBtn:{flexDirection:'row',alignItems:'center',backgroundColor:'#e94560',borderRadius:14,padding:16,width:'100%',marginBottom:20},
  adminText:{color:'#fff',fontSize:16,fontWeight:'700',marginLeft:12,flex:1},
  chevron:{marginLeft:'auto'},
  menu:{backgroundColor:'#1a1a2e',borderRadius:14,width:'100%',overflow:'hidden',marginBottom:20},
  menuItem:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:'#2a2a4a'},
  menuText:{color:'#e2e8f0',fontSize:15},
  logoutBtn:{flexDirection:'row',alignItems:'center',backgroundColor:'#1a1a2e',borderRadius:14,padding:16,width:'100%'},
  logoutText:{color:'#e94560',fontSize:15,fontWeight:'600',marginLeft:10},
});
