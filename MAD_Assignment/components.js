import React, { useEffect, useState } from 'react';
import {
  Alert,
  Animated as NativeAnimated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const COLORS = {
  background: '#0F172A',
  surface: '#1E293B',
  primary: '#6366F1',
  todo: '#6366F1',
  progress: '#F59E0B',
  completed: '#10B981',
  low: '#3B82F6',
  medium: '#F59E0B',
  high: '#EF4444',
  text: '#F1F5F9',
  muted: '#94A3B8',
  border: '#334155',
  completedTint: '#064E3B',
  overdue: '#7F1D1D',
};

const AVATAR_COLORS = ['#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444'];
const STATUSES = { TODO: 'TO DO', IN_PROGRESS: 'IN PROGRESS', COMPLETED: 'COMPLETED' };
const SORTS = [
  { key: 'dueDate', label: 'Due Date', icon: '📅' },
  { key: 'urgency', label: 'Urgency', icon: '🔥' },
  { key: 'priority', label: 'Priority', icon: '⚡' },
  { key: 'status', label: 'Status', icon: '📋' },
  { key: 'assignedUser', label: 'Assigned User', icon: '👤' },
  { key: 'createdDate', label: 'Created', icon: '🕐' },
  { key: 'requiredTime', label: 'Time', icon: '⏱' },
];

export function formatDate(value) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${formatDate(value)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatRequiredTime(task) {
  const hours = Number(task.requiredHours || 0);
  const minutes = Number(task.requiredMinutes || 0);
  if (!hours && !minutes) return '0m';
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function getDeadlineStatus(task) {
  if (task.status === 'COMPLETED') return 'COMPLETED';
  if (!task.deadline) return 'SAFE';
  const deadline = new Date(task.deadline).getTime();
  const diff = deadline - Date.now();
  if (diff < 0) return 'OVERDUE';
  if (diff < 24 * 60 * 60 * 1000) return 'URGENT';
  if (diff <= 3 * 24 * 60 * 60 * 1000) return 'WARNING';
  return 'SAFE';
}

export function getDeadlineColor(task, nowOverride) {
  if (task.status === 'COMPLETED' || task.completed === true) {
    return {
      border: '#10B981',
      background: '#064E3B',
      label: 'completed',
    };
  }

  if (!task.deadline) {
    return {
      border: '#6366F1',
      background: 'transparent',
      label: 'no-deadline',
    };
  }

  const now = nowOverride || new Date();
  const deadline = new Date(task.deadline);
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const diffMs = deadDay - nowDay;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) {
    return {
      border: '#7F1D1D',
      background: '#450A0A',
      label: 'overdue',
      pulse: true,
    };
  }

  if (diffDays === 0) {
    return {
      border: '#EF4444',
      background: '#1C0A0A',
      label: 'due-today',
      pulse: true,
    };
  }

  if (diffDays < 1) {
    return {
      border: '#EF4444',
      background: '#1C0A0A',
      label: 'urgent',
      pulse: true,
    };
  }

  if (diffDays <= 3) {
    return {
      border: task.status === 'IN_PROGRESS' ? '#F97316' : '#F59E0B',
      background: '#1C1200',
      label: task.status === 'IN_PROGRESS' ? 'in-progress-warning' : 'warning',
    };
  }

  if (task.status === 'IN_PROGRESS') {
    return {
      border: '#F59E0B',
      background: '#1C1200',
      label: 'in-progress-safe',
    };
  }

  return {
    border: '#6366F1',
    background: 'transparent',
    label: 'safe',
  };
}

function useBorderPulse(task, color) {
  const pulseAnim = React.useRef(new NativeAnimated.Value(1)).current;

  useEffect(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);

    if (color.pulse === true) {
      NativeAnimated.loop(
        NativeAnimated.sequence([
          NativeAnimated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          NativeAnimated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [color.pulse, pulseAnim, task.status, task.deadline]);

  return pulseAnim;
}

function getInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function getAvatarColor(name) {
  const total = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[total % AVATAR_COLORS.length];
}

export function PriorityBadge({ priority }) {
  const color = priority === 'HIGH' ? COLORS.high : priority === 'MEDIUM' ? COLORS.medium : COLORS.low;
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{priority}</Text>
    </View>
  );
}

export function StatusBadge({ status }) {
  const color = status === 'COMPLETED' ? COLORS.completed : status === 'IN_PROGRESS' ? COLORS.progress : COLORS.todo;
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <Text style={[styles.statusText, { color }]}>{STATUSES[status]}</Text>
    </View>
  );
}

export function AvatarGroup({ users = [], max = 3 }) {
  const visibleUsers = users.slice(0, max);
  const overflow = users.length - visibleUsers.length;
  return (
    <View style={styles.avatarRow}>
      {visibleUsers.map((user) => (
        <View key={user} style={[styles.avatar, { backgroundColor: getAvatarColor(user) }]}>
          <Text style={styles.avatarText}>{getInitials(user)}</Text>
        </View>
      ))}
      {overflow > 0 ? (
        <View style={[styles.avatar, styles.overflowAvatar]}>
          <Text style={styles.avatarText}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function TaskCard({ task, onPress, onLongPress, onDragStart, onDragEnd, nowOverride }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const color = getDeadlineColor(task, nowOverride);
  const pulseAnim = useBorderPulse(task, color);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: interpolate(scale.value, [1, 1.05], [1, 0.9]),
    zIndex: scale.value > 1 ? 30 : 1,
    elevation: scale.value > 1 ? 12 : 3,
  }));

  const handleGesture = (event) => {
    translateX.value = event.nativeEvent.translationX;
    translateY.value = event.nativeEvent.translationY;
  };

  const handleStateChange = (event) => {
    const native = event.nativeEvent;
    if (native.state === State.BEGAN) {
      scale.value = withSpring(1.05);
      onDragStart?.(task.id);
    }
    if (native.oldState === State.ACTIVE) {
      onDragEnd?.(task.id, native.absoluteX, native.absoluteY);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
    }
  };

  return (
    <PanGestureHandler onGestureEvent={handleGesture} onHandlerStateChange={handleStateChange}>
      <Animated.View style={[animatedStyle]}>
        <Pressable onPress={() => onPress(task)} onLongPress={() => onLongPress(task)} delayLongPress={450}>
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: COLORS.surface },
            ]}
          >
            <NativeAnimated.View style={[styles.leftBorderStrip, { backgroundColor: color.border, opacity: pulseAnim }]} />
            {color.background !== 'transparent' ? (
              <View pointerEvents="none" style={[styles.tintOverlay, { backgroundColor: color.background }]} />
            ) : null}
            <View style={styles.cardContent}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle} numberOfLines={2}>{task.title}</Text>
                <PriorityBadge priority={task.priority} />
              </View>
              <Text style={styles.cardMeta}>{formatDate(task.deadline)}</Text>
              <Text style={styles.cardMeta}>{formatRequiredTime(task)}</Text>
              <View style={styles.cardFooter}>
                <AvatarGroup users={task.assignedUsers} max={3} />
                <Text style={styles.commentCount}>💬 {task.comments?.length || 0}</Text>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </PanGestureHandler>
  );
}

export function BoardColumn({
  title,
  status,
  tasks,
  columnColor,
  onAddTask,
  onCardPress,
  onCardLongPress,
  onCardDrop,
  onDragStart,
  columnRef,
  columnWidth,
  nowOverride,
}) {
  const handleLayout = () => {
    requestAnimationFrame(() => {
      columnRef?.current?.measureInWindow?.((x, y, width, height) => {
        onCardDrop?.(status, { x, y, width, height });
      });
    });
  };

  return (
    <View ref={columnRef} onLayout={handleLayout} style={[styles.column, { borderTopColor: columnColor, width: columnWidth }]}>
      <View style={styles.columnHeader}>
        <Text style={styles.columnTitle}>{title}</Text>
        <View style={[styles.countBadge, { backgroundColor: columnColor }]}>
          <Text style={styles.countText}>{tasks.length}</Text>
        </View>
      </View>
      {status === 'TODO' ? (
        <Pressable style={styles.addTaskButton} onPress={onAddTask}>
          <Text style={styles.addTaskText}>+ Add Task</Text>
        </Pressable>
      ) : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.columnScroll}>
        {tasks.length === 0 ? <Text style={styles.emptyColumnText}>No tasks yet</Text> : null}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onPress={onCardPress}
            onLongPress={onCardLongPress}
            onDragStart={onDragStart}
            onDragEnd={onCardDrop}
            nowOverride={nowOverride}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function getInitialForm(initialTask) {
  const deadline = initialTask?.deadline ? new Date(initialTask.deadline) : null;
  const reminder = initialTask?.reminderTime ? new Date(initialTask.reminderTime) : null;
  return {
    title: initialTask?.title || '',
    description: initialTask?.description || '',
    priority: initialTask?.priority || 'MEDIUM',
    requiredHours: initialTask?.requiredHours?.toString?.() || '',
    requiredMinutes: initialTask?.requiredMinutes?.toString?.() || '',
    deadline,
    reminderTime: reminder,
    assignedUsers: initialTask?.assignedUsers || [],
  };
}

function getDeadlineParts(date) {
  if (!date || Number.isNaN(date.getTime())) return { day: '', month: '', year: '' };
  return {
    day: date.getDate().toString().padStart(2, '0'),
    month: (date.getMonth() + 1).toString().padStart(2, '0'),
    year: date.getFullYear().toString(),
  };
}

function getReminderParts(date) {
  if (!date || Number.isNaN(date.getTime())) return { hour: '', minute: '', period: 'AM' };
  const hours = date.getHours();
  return {
    hour: ((hours % 12) || 12).toString().padStart(2, '0'),
    minute: date.getMinutes().toString().padStart(2, '0'),
    period: hours >= 12 ? 'PM' : 'AM',
  };
}

function buildDateFromParts(parts) {
  const day = Number.parseInt(parts.day, 10);
  const month = Number.parseInt(parts.month, 10);
  const year = Number.parseInt(parts.year, 10);
  if (!day || !month || !year || parts.year.length !== 4) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function buildTimeFromParts(parts) {
  const hour = Number.parseInt(parts.hour, 10);
  const minute = Number.parseInt(parts.minute, 10);
  if (!hour || Number.isNaN(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  const date = new Date();
  const normalizedHour = parts.period === 'PM' ? (hour % 12) + 12 : hour % 12;
  date.setHours(normalizedHour, minute, 0, 0);
  return date;
}

export function AddTaskModal({
  visible,
  onClose,
  onSubmit,
  onTestNotification,
  initialTask = null,
  submitLabel = 'Create Task',
}) {
  const [form, setForm] = useState(getInitialForm(initialTask));
  const [nameInput, setNameInput] = useState('');
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [deadlineParts, setDeadlineParts] = useState(getDeadlineParts(form.deadline));
  const [reminderParts, setReminderParts] = useState(getReminderParts(form.reminderTime));

  useEffect(() => {
    if (visible) {
      const nextForm = getInitialForm(initialTask);
      setForm(nextForm);
      setDeadlineParts(getDeadlineParts(nextForm.deadline));
      setReminderParts(getReminderParts(nextForm.reminderTime));
      setNameInput('');
      setShowDeadlinePicker(false);
      setShowReminderPicker(false);
    }
  }, [initialTask, visible]);

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const addUser = () => {
    const name = nameInput.trim();
    if (!name || form.assignedUsers.includes(name)) return;
    setValue('assignedUsers', [...form.assignedUsers, name]);
    setNameInput('');
  };

  const removeUser = (name) => {
    setValue('assignedUsers', form.assignedUsers.filter((user) => user !== name));
  };

  const updateDeadlinePart = (key, value) => {
    const maxLength = key === 'year' ? 4 : 2;
    const nextParts = { ...deadlineParts, [key]: value.replace(/[^0-9]/g, '').slice(0, maxLength) };
    setDeadlineParts(nextParts);
    const date = buildDateFromParts(nextParts);
    setValue('deadline', date);
  };

  const updateReminderPart = (key, value) => {
    const nextParts = { ...reminderParts, [key]: value.replace(/[^0-9]/g, '').slice(0, 2) };
    setReminderParts(nextParts);
    const date = buildTimeFromParts(nextParts);
    setValue('reminderTime', date);
  };

  const updateReminderPeriod = (period) => {
    const nextParts = { ...reminderParts, period };
    setReminderParts(nextParts);
    const date = buildTimeFromParts(nextParts);
    setValue('reminderTime', date);
  };

  const handleSubmit = () => {
    const title = form.title.trim();
    const hours = Number.parseInt(form.requiredHours || '0', 10);
    const minutes = Number.parseInt(form.requiredMinutes || '0', 10);
    if (!title) {
      Alert.alert('Missing title', 'Please enter a task title.');
      return;
    }
    const deadline = Platform.OS === 'web' ? buildDateFromParts(deadlineParts) : form.deadline;
    const reminderClock = Platform.OS === 'web' ? buildTimeFromParts(reminderParts) : form.reminderTime;

    if (!deadline) {
      Alert.alert('Missing deadline', 'Please enter a valid deadline date.');
      return;
    }
    if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || minutes < 0 || minutes > 59 || hours + minutes <= 0) {
      Alert.alert('Invalid time', 'Please enter a valid required time.');
      return;
    }

    let reminderTime = null;
    if (reminderClock) {
      const combined = new Date(deadline);
      combined.setHours(reminderClock.getHours(), reminderClock.getMinutes(), 0, 0);
      reminderTime = combined.toISOString();
    }

    onSubmit({
      title,
      description: form.description.trim(),
      priority: form.priority,
      requiredHours: hours,
      requiredMinutes: minutes,
      deadline: deadline.toISOString(),
      reminderTime,
      assignedUsers: form.assignedUsers,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={[styles.formModal, initialTask ? styles.editFormModal : null]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{initialTask ? 'Edit Task' : 'Add Task'}</Text>
            <Pressable style={styles.iconButton} onPress={onClose}>
              <Text style={styles.iconButtonText}>×</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput
              style={styles.input}
              placeholder="Task title"
              placeholderTextColor={COLORS.muted}
              value={form.title}
              onChangeText={(value) => setValue('title', value)}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={form.description}
              multiline
              onChangeText={(value) => setValue('description', value)}
            />
            <Text style={styles.inputLabel}>Priority</Text>
            <View style={styles.segmentRow}>
              {['LOW', 'MEDIUM', 'HIGH'].map((priority) => (
                <Pressable
                  key={priority}
                  style={[styles.segment, form.priority === priority ? styles.segmentActive : styles.segmentInactive]}
                  onPress={() => setValue('priority', priority)}
                >
                  <Text style={form.priority === priority ? styles.segmentActiveText : styles.segmentText}>{priority}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.inputLabel}>Required Time</Text>
            <View style={styles.timeRow}>
              <TextInput
                style={[styles.input, styles.timeInput]}
                placeholder="Hours"
                placeholderTextColor={COLORS.muted}
                keyboardType="number-pad"
                value={form.requiredHours}
                onChangeText={(value) => setValue('requiredHours', value.replace(/[^0-9]/g, ''))}
              />
              <TextInput
                style={[styles.input, styles.timeInput]}
                placeholder="Minutes"
                placeholderTextColor={COLORS.muted}
                keyboardType="number-pad"
                value={form.requiredMinutes}
                onChangeText={(value) => setValue('requiredMinutes', value.replace(/[^0-9]/g, ''))}
              />
            </View>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setShowDeadlinePicker(true);
              }}
            >
              <Text style={styles.secondaryButtonText}>Set Deadline</Text>
            </Pressable>
            {Platform.OS === 'web' ? (
              <View style={styles.datePartsRow}>
                <TextInput
                  style={[styles.input, styles.datePartInput]}
                  placeholder="DD"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="number-pad"
                  value={deadlineParts.day}
                  onChangeText={(value) => updateDeadlinePart('day', value)}
                />
                <TextInput
                  style={[styles.input, styles.datePartInput]}
                  placeholder="MM"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="number-pad"
                  value={deadlineParts.month}
                  onChangeText={(value) => updateDeadlinePart('month', value)}
                />
                <TextInput
                  style={[styles.input, styles.yearPartInput]}
                  placeholder="YYYY"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="number-pad"
                  value={deadlineParts.year}
                  onChangeText={(value) => updateDeadlinePart('year', value)}
                />
              </View>
            ) : null}
            <Text style={styles.selectedDate}>
              {form.deadline ? formatDate(form.deadline) : 'Enter deadline as DD / MM / YYYY'}
            </Text>
            {showDeadlinePicker && Platform.OS === 'web' ? (
              <Text style={styles.helperText}>Use the three boxes above. Example: 25 / 05 / 2026</Text>
            ) : null}
            {showDeadlinePicker && Platform.OS !== 'web' ? (
              <DateTimePicker
                value={form.deadline || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, date) => {
                  setShowDeadlinePicker(Platform.OS === 'ios');
                  if (date) setValue('deadline', date);
                }}
              />
            ) : null}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setShowReminderPicker(true);
              }}
            >
              <Text style={styles.secondaryButtonText}>Set Reminder Time</Text>
            </Pressable>
            {Platform.OS === 'web' ? (
              <View style={styles.reminderRow}>
                <TextInput
                  style={[styles.input, styles.datePartInput]}
                  placeholder="HH"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="number-pad"
                  value={reminderParts.hour}
                  onChangeText={(value) => updateReminderPart('hour', value)}
                />
                <TextInput
                  style={[styles.input, styles.datePartInput]}
                  placeholder="MM"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="number-pad"
                  value={reminderParts.minute}
                  onChangeText={(value) => updateReminderPart('minute', value)}
                />
                {['AM', 'PM'].map((period) => (
                  <Pressable
                    key={period}
                    style={[styles.periodButton, reminderParts.period === period ? styles.periodButtonActive : null]}
                    onPress={() => updateReminderPeriod(period)}
                  >
                    <Text style={reminderParts.period === period ? styles.periodButtonActiveText : styles.periodButtonText}>
                      {period}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.selectedDate}>
              {form.reminderTime
                ? form.reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Optional. Enter reminder as HH : MM AM/PM'}
            </Text>
            {showReminderPicker && Platform.OS === 'web' ? (
              <Text style={styles.helperText}>For a fast test, set this one or two minutes ahead of the current time.</Text>
            ) : null}
            {showReminderPicker && Platform.OS !== 'web' ? (
              <DateTimePicker
                value={form.reminderTime || new Date()}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, date) => {
                  setShowReminderPicker(Platform.OS === 'ios');
                  if (date) setValue('reminderTime', date);
                }}
              />
            ) : null}
            <Text style={styles.inputLabel}>Assigned Users</Text>
            <View style={styles.assignRow}>
              <TextInput
                style={[styles.input, styles.assignInput]}
                placeholder="Name"
                placeholderTextColor={COLORS.muted}
                value={nameInput}
                onChangeText={setNameInput}
                onSubmitEditing={addUser}
              />
              <Pressable style={styles.addUserButton} onPress={addUser}>
                <Text style={styles.addUserText}>Add</Text>
              </Pressable>
            </View>
            <View style={styles.chipWrap}>
              {form.assignedUsers.map((user) => (
                <Pressable key={user} style={styles.userChip} onPress={() => removeUser(user)}>
                  <Text style={styles.userChipText}>{user} ×</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.testButton} onPress={onTestNotification}>
              <Text style={styles.testButtonText}>Test Notification</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleSubmit}>
              <Text style={styles.primaryButtonText}>{submitLabel}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function TaskDetailModal({ task, visible, onClose, onEdit, onDelete, onComplete, onAddComment, currentUser, nowOverride }) {
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (visible) setComment('');
  }, [visible, task?.id]);

  if (!task) return null;
  const color = getDeadlineColor(task, nowOverride);

  const handlePost = () => {
    const text = comment.trim();
    if (!text) return;
    onAddComment?.(task.id, text);
    setComment('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.detailModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={2}>{task.title}</Text>
            <Pressable style={styles.iconButton} onPress={onClose}>
              <Text style={styles.iconButtonText}>×</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.detailCard}>
              <View style={[styles.detailDeadlineStrip, { backgroundColor: color.border }]} />
              {color.background !== 'transparent' ? (
                <View pointerEvents="none" style={[styles.tintOverlay, { backgroundColor: color.background }]} />
              ) : null}
              <View style={styles.detailHeaderRow}>
                <StatusBadge status={task.status} />
                <View style={[styles.deadlineIndicator, { borderColor: color.border }]}>
                  <Text style={[styles.deadlineIndicatorText, { color: color.border }]}>{color.label}</Text>
                </View>
                <PriorityBadge priority={task.priority} />
              </View>
              <Text style={styles.detailMeta}>Deadline: {formatDate(task.deadline)}</Text>
              <Text style={styles.detailMeta}>Required: {formatRequiredTime(task)}</Text>
              <AvatarGroup users={task.assignedUsers} max={6} />
            </View>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{task.description || 'No description provided.'}</Text>
            <Text style={styles.sectionTitle}>Comments / Activity</Text>
            {[...(task.activityLog || []).map((item) => ({ ...item, kind: 'activity' })), ...(task.comments || []).map((item) => ({ ...item, kind: 'comment' }))]
              .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
              .map((item) => (
                <View key={`${item.kind}-${item.id}`} style={styles.timelineItem}>
                  <Text style={styles.timelineTitle}>
                    {item.kind === 'comment' ? `${item.author || currentUser} commented` : item.text}
                  </Text>
                  {item.kind === 'comment' ? <Text style={styles.timelineText}>{item.text}</Text> : null}
                  <Text style={styles.timelineTime}>{formatDateTime(item.timestamp)}</Text>
                </View>
              ))}
            <View style={styles.commentComposer}>
              <TextInput
                style={[styles.input, styles.commentInput]}
                placeholder="Add a comment"
                placeholderTextColor={COLORS.muted}
                value={comment}
                multiline
                onChangeText={setComment}
              />
              <Pressable style={styles.postButton} onPress={handlePost}>
                <Text style={styles.postText}>Post</Text>
              </Pressable>
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryAction} onPress={() => onEdit(task)}>
                <Text style={styles.secondaryActionText}>Edit Task</Text>
              </Pressable>
              {task.status !== 'COMPLETED' ? (
                <Pressable style={styles.completeAction} onPress={() => onComplete(task.id)}>
                  <Text style={styles.completeActionText}>Mark as Completed</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable style={styles.deleteButton} onPress={() => onDelete(task.id)}>
              <Text style={styles.deleteButtonText}>Delete Task</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ListViewItem({ task, onPress, nowOverride }) {
  const color = getDeadlineColor(task, nowOverride);
  const pulseAnim = useBorderPulse(task, color);

  return (
    <Pressable
      style={[
        styles.listItem,
        { backgroundColor: COLORS.surface },
      ]}
      onPress={() => onPress(task)}
    >
      <NativeAnimated.View style={[styles.leftBorderStrip, { backgroundColor: color.border, opacity: pulseAnim }]} />
      {color.background !== 'transparent' ? (
        <View pointerEvents="none" style={[styles.tintOverlay, styles.lightTintOverlay, { backgroundColor: color.background }]} />
      ) : null}
      <View style={styles.cardContent}>
        <View style={styles.listTopRow}>
          <Text style={styles.listTitle} numberOfLines={1}>{task.title}</Text>
          <PriorityBadge priority={task.priority} />
        </View>
        <Text style={styles.listDescription} numberOfLines={2}>
          {task.description || 'No description added.'}
        </Text>
        <View style={styles.listDetailGrid}>
          <View style={styles.listDetailCell}>
            <Text style={styles.listLabel}>Status</Text>
            <StatusBadge status={task.status} />
          </View>
          <View style={styles.listDetailCell}>
            <Text style={styles.listLabel}>Deadline</Text>
            <Text style={styles.listMeta}>{formatDate(task.deadline)}</Text>
          </View>
          <View style={styles.listDetailCell}>
            <Text style={styles.listLabel}>Time</Text>
            <Text style={styles.listMeta}>{formatRequiredTime(task)}</Text>
          </View>
          <View style={styles.listDetailCell}>
            <Text style={styles.listLabel}>Assigned</Text>
            <AvatarGroup users={task.assignedUsers} max={3} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function SortChipBar({ sortBy, onSortChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.sortScroller}
      contentContainerStyle={styles.sortRow}
    >
      {SORTS.map((sort) => {
        const active = sortBy === sort.key;
        return (
          <Pressable
            key={sort.key}
            style={[styles.sortChip, active ? styles.sortChipActive : styles.sortChipInactive]}
            onPress={() => onSortChange(sort.key)}
          >
            <Text style={active ? styles.sortChipActiveText : styles.sortChipText}>
              {sort.icon} {sort.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export { COLORS, STATUSES };

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  addTaskButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    marginBottom: 12,
    paddingVertical: 12,
  },
  addTaskText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  addUserButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  addUserText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  assignInput: {
    flex: 1,
    marginBottom: 0,
  },
  assignRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  avatar: {
    alignItems: 'center',
    borderColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    marginRight: -6,
    width: 28,
  },
  avatarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 30,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  card: {
    borderRadius: 14,
    elevation: 3,
    marginBottom: 12,
    overflow: 'hidden',
    padding: 14,
    paddingLeft: 20,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowRadius: 14,
  },
  cardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardContent: {
    position: 'relative',
    zIndex: 1,
  },
  cardMeta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 5,
  },
  cardTitle: {
    color: COLORS.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    marginRight: 8,
  },
  cardTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  column: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    borderTopWidth: 4,
    height: '100%',
    marginRight: 12,
    minHeight: 560,
    padding: 14,
  },
  columnHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  columnScroll: {
    paddingBottom: 24,
  },
  columnTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
  },
  commentComposer: {
    marginTop: 12,
  },
  commentCount: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  commentInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  completeAction: {
    alignItems: 'center',
    backgroundColor: COLORS.completed,
    borderRadius: 12,
    flex: 1,
    paddingVertical: 12,
  },
  completeActionText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  countBadge: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    minWidth: 28,
    paddingHorizontal: 8,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: COLORS.high,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
  },
  deleteButtonText: {
    color: COLORS.high,
    fontWeight: '900',
  },
  datePartInput: {
    flex: 1,
    marginBottom: 0,
    textAlign: 'center',
  },
  datePartsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    marginTop: 10,
  },
  descriptionText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  detailCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 14,
    paddingLeft: 20,
  },
  deadlineIndicator: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deadlineIndicatorText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  detailDeadlineStrip: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 5,
  },
  detailMeta: {
    color: COLORS.muted,
    fontSize: 13,
  },
  detailModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    maxHeight: '90%',
    padding: 18,
    width: '92%',
  },
  emptyColumnText: {
    color: COLORS.muted,
    fontSize: 13,
    paddingTop: 36,
    textAlign: 'center',
  },
  editFormModal: {
    elevation: 40,
    shadowOpacity: 0.35,
    zIndex: 40,
  },
  formModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    maxHeight: '92%',
    padding: 18,
    width: '92%',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  iconButtonText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
  },
  input: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 15,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -4,
  },
  leftBorderStrip: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 5,
  },
  lightTintOverlay: {
    opacity: 0.28,
  },
  listBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    marginTop: 8,
  },
  listDetailCell: {
    flexBasis: 150,
    flexGrow: 1,
    gap: 5,
    minHeight: 44,
  },
  listDetailGrid: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  listLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  listItem: {
    borderRadius: 14,
    borderColor: COLORS.border,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
    padding: 14,
    paddingLeft: 20,
  },
  listDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  listMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  listTitle: {
    color: COLORS.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    marginRight: 10,
  },
  listTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  modalTitle: {
    color: COLORS.text,
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    marginRight: 12,
  },
  overflowAvatar: {
    backgroundColor: COLORS.border,
  },
  periodButton: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  periodButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  periodButtonActiveText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  periodButtonText: {
    color: COLORS.muted,
    fontWeight: '900',
  },
  postButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  postText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    marginTop: 6,
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  secondaryActionText: {
    color: COLORS.text,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: COLORS.primary,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontWeight: '800',
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 18,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    paddingVertical: 11,
  },
  segmentActive: {
    backgroundColor: COLORS.primary,
  },
  segmentActiveText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  segmentInactive: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segmentText: {
    color: COLORS.muted,
    fontWeight: '800',
  },
  selectedDate: {
    color: COLORS.muted,
    fontSize: 13,
    marginBottom: 12,
    marginTop: 8,
  },
  sortChip: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 14,
  },
  sortChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sortChipActiveText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  sortChipInactive: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  sortChipText: {
    color: COLORS.muted,
    fontWeight: '800',
  },
  sortScroller: {
    flexGrow: 0,
    flexShrink: 0,
    height: 52,
    maxHeight: 52,
  },
  sortRow: {
    alignItems: 'center',
    paddingBottom: 14,
    paddingHorizontal: 18,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  tintOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.42,
  },
  timeInput: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reminderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    marginTop: 10,
  },
  testButton: {
    alignItems: 'center',
    borderColor: COLORS.completed,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    paddingVertical: 13,
  },
  testButtonText: {
    color: COLORS.completed,
    fontSize: 14,
    fontWeight: '900',
  },
  timelineItem: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    padding: 12,
  },
  timelineText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  timelineTime: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 6,
  },
  timelineTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },
  userChip: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userChipText: {
    color: COLORS.text,
    fontWeight: '700',
  },
  yearPartInput: {
    flex: 2,
    marginBottom: 0,
    textAlign: 'center',
  },
});
