import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CustomDatePickerProps {
  visible: boolean;
  currentDate: Date;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  visible,
  currentDate,
  onClose,
  onSelectDate,
}) => {
  const [viewDate, setViewDate] = useState(currentDate || new Date());

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const generateDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    
    // Empty slots for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Actual days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const changeMonth = (offset: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1 && d2 &&
      d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear();
  };

  const setToday = () => {
    const today = new Date();
    setViewDate(today);
    onSelectDate(today);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Choose a date</Text>
            <Text style={styles.subtitle}>Pick a day from the calendar below.</Text>
          </View>

          {/* Month / Year Selectors */}
          <View style={styles.selectorsRow}>
            <View style={styles.selectorGroup}>
              <Text style={styles.selectorLabel}>MONTH</Text>
              <TouchableOpacity style={styles.selectorDropdown}>
                <Text style={styles.selectorText}>{MONTHS[viewDate.getMonth()]}</Text>
                <Ionicons name="chevron-down" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.selectorGroup}>
              <Text style={styles.selectorLabel}>YEAR</Text>
              <TouchableOpacity style={styles.selectorDropdown}>
                <Text style={styles.selectorText}>{viewDate.getFullYear()}</Text>
                <Ionicons name="chevron-down" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Calendar Box */}
          <View style={styles.calendarBox}>
            <View style={styles.calendarHeader}>
              <View style={styles.arrows}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowBtn}>
                  <Ionicons name="chevron-back" size={20} color="#0f172a" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowBtn}>
                  <Ionicons name="chevron-forward" size={20} color="#0f172a" />
                </TouchableOpacity>
              </View>
              <Text style={styles.currentMonthYear}>
                {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </Text>
            </View>

            <View style={styles.daysHeader}>
              {DAYS.map(day => (
                <View key={day} style={styles.headerCell}>
                  <Text style={styles.dayHeaderText}>{day}</Text>
                </View>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {generateDays().map((date, index) => (
                <View key={index} style={styles.dayCell}>
                  {date ? (
                    <TouchableOpacity
                      style={[
                        styles.dayButton,
                        isSameDay(date, currentDate) && styles.selectedDayButton
                      ]}
                      onPress={() => onSelectDate(date)}
                    >
                      <Text style={[
                        styles.dayText,
                        isSameDay(date, currentDate) && styles.selectedDayText
                      ]}>
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={setToday} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>Today</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    ...Platform.select({
      web: { boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    }),
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  selectorsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  selectorGroup: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
    marginBottom: 8,
  },
  selectorDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#0ea5e9',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f0f9ff',
  },
  selectorText: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '500',
  },
  calendarBox: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  arrows: {
    flexDirection: 'row',
  },
  arrowBtn: {
    padding: 4,
    marginRight: 8,
  },
  currentMonthYear: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  daysHeader: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    marginBottom: 8,
  },
  headerCell: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayHeaderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDayButton: {
    backgroundColor: '#0f172a',
  },
  dayText: {
    fontSize: 14,
    color: '#0f172a',
  },
  selectedDayText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  todayButton: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  todayButtonText: {
    color: '#059669',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
