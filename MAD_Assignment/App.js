import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  AddTaskModal,
  BoardColumn,
  COLORS,
  ListViewItem,
  SortChipBar,
  TaskDetailModal,
  formatDate,
  getDeadlineStatus,
} from './components';
import {
  appendTaskLog,
  generateId,
  loadTasks,
  loadUserName,
  readTaskLog,
  saveTasks,
  saveUserName,
} from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const COLUMNS = [
  { status: 'TODO', title: 'TO DO', color: '#6366F1' },
  { status: 'IN_PROGRESS', title: 'IN PROGRESS', color: '#F59E0B' },
  { status: 'COMPLETED', title: 'COMPLETED', color: '#10B981' },
];

const NOTIFICATION_CHANNEL_ID = 'task-reminders';

const priorityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const statusRank = { TODO: 1, IN_PROGRESS: 2, COMPLETED: 3 };
const urgencyRank = { OVERDUE: 1, URGENT: 2, WARNING: 3, SAFE: 4, COMPLETED: 5 };

function deadlineTime(task) {
  if (!task.deadline) return Number.POSITIVE_INFINITY;
  const time = new Date(task.deadline).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function getSortedTasks(tasks, sortBy) {
  const byDeadline = (a, b) => deadlineTime(a) - deadlineTime(b);
  return [...tasks].sort((a, b) => {
    if (sortBy === 'urgency') {
      return urgencyRank[getDeadlineStatus(a)] - urgencyRank[getDeadlineStatus(b)] || byDeadline(a, b);
    }
    if (sortBy === 'priority') {
      return priorityRank[b.priority] - priorityRank[a.priority] || byDeadline(a, b);
    }
    if (sortBy === 'status') {
      return statusRank[a.status] - statusRank[b.status] || byDeadline(a, b);
    }
    if (sortBy === 'assignedUser') {
      const userA = a.assignedUsers?.[0]?.toLowerCase() || 'zzzzzzzz-unassigned';
      const userB = b.assignedUsers?.[0]?.toLowerCase() || 'zzzzzzzz-unassigned';
      return userA.localeCompare(userB) || byDeadline(a, b);
    }
    if (sortBy === 'createdDate') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === 'requiredTime') {
      const totalA = Number(a.requiredHours || 0) * 60 + Number(a.requiredMinutes || 0);
      const totalB = Number(b.requiredHours || 0) * 60 + Number(b.requiredMinutes || 0);
      return totalB - totalA;
    }
    return byDeadline(a, b);
  });
}

export default function App() {
  const { width } = useWindowDimensions();
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('board');
  const [sortBy, setSortBy] = useState('dueDate');
  const [userName, setUserName] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [debugOffsetDays, setDebugOffsetDays] = useState(0);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [columnLayouts, setColumnLayouts] = useState({});
  const reminderTimers = useRef([]);
  const columnRefs = {
    TODO: useRef(null),
    IN_PROGRESS: useRef(null),
    COMPLETED: useRef(null),
  };

  useEffect(() => {
    let notificationSub;
    async function bootstrap() {
      const [storedTasks, storedUserName] = await Promise.all([loadTasks(), loadUserName()]);
      setTasks(Array.isArray(storedTasks) ? storedTasks : []);
      if (storedUserName) {
        setUserName(storedUserName);
      } else {
        setShowNameModal(true);
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
          name: 'Task reminders',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366F1',
        });
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
        if (window.Notification.permission === 'default') {
          await window.Notification.requestPermission();
        }
      } else {
        await Notifications.requestPermissionsAsync();
        notificationSub = Notifications.addNotificationReceivedListener((notification) => {
          Alert.alert(
            notification.request.content.title || 'Task Reminder',
            notification.request.content.body || 'A task reminder was received.',
          );
        });
      }
    }
    bootstrap();
    return () => notificationSub?.remove?.();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    reminderTimers.current.forEach((timer) => clearTimeout(timer));
    reminderTimers.current = tasks
      .filter((task) => task.reminderTime && new Date(task.reminderTime).getTime() > Date.now())
      .map((task) => {
        const delay = new Date(task.reminderTime).getTime() - Date.now();
        return setTimeout(() => {
          const title = `Task Reminder: ${task.title}`;
          const body = `Deadline: ${formatDate(task.deadline)} - Priority: ${task.priority}`;
          if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
            new window.Notification(title, { body });
          }
          Alert.alert(title, body);
        }, delay);
      });
    return () => {
      reminderTimers.current.forEach((timer) => clearTimeout(timer));
      reminderTimers.current = [];
    };
  }, [tasks]);

  const selectedTaskLive = useMemo(
    () => tasks.find((task) => task.id === selectedTask?.id) || selectedTask,
    [selectedTask, tasks],
  );

  const sortedTasks = useMemo(() => getSortedTasks(tasks, sortBy), [sortBy, tasks]);
  const boardColumnWidth = Math.max(300, Math.floor((width - 60) / 3));
  const effectiveNow = getNow();

  function getNow() {
    const date = new Date();
    date.setDate(date.getDate() + debugOffsetDays);
    return date;
  }

  async function persist(nextTasks) {
    setTasks(nextTasks);
    await saveTasks(nextTasks);
  }

  async function scheduleTaskNotification(task) {
    if (!task.reminderTime) return null;
    const triggerDate = new Date(task.reminderTime);
    if (Number.isNaN(triggerDate.getTime()) || triggerDate.getTime() <= Date.now()) return null;
    if (Platform.OS === 'web') return null;
    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: `Task Reminder: ${task.title}`,
          body: `Deadline: ${formatDate(task.deadline)} - Priority: ${task.priority}`,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          channelId: NOTIFICATION_CHANNEL_ID,
        },
      });
    } catch (error) {
      console.warn('Unable to schedule notification', error);
      return null;
    }
  }

  async function testNotification() {
    const title = 'TaskFlow Test Notification';
    const body = 'Notifications are working. Create a task with a future reminder time to test task reminders.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const permission = window.Notification.permission === 'default'
          ? await window.Notification.requestPermission()
          : window.Notification.permission;
        if (permission === 'granted') {
          new window.Notification(title, { body });
        }
      }
      Alert.alert(title, body);
      return;
    }
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Notifications disabled', 'Enable notification permission for this app, then try again.');
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
        channelId: NOTIFICATION_CHANNEL_ID,
      },
    });
    Alert.alert('Test scheduled', 'A local notification should appear in about 5 seconds.');
  }

  async function cancelNotification(notificationId) {
    if (notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch (error) {
        console.warn('Unable to cancel notification', error);
      }
    }
  }

  async function addTask(taskData) {
    const now = new Date().toISOString();
    const task = {
      id: generateId(),
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority,
      requiredHours: taskData.requiredHours,
      requiredMinutes: taskData.requiredMinutes,
      deadline: taskData.deadline,
      reminderTime: taskData.reminderTime,
      notificationId: null,
      status: 'TODO',
      assignedUsers: taskData.assignedUsers,
      comments: [],
      activityLog: [{ id: generateId(), text: 'Task created', timestamp: now }],
      createdAt: now,
    };
    task.notificationId = await scheduleTaskNotification(task);
    await persist([...tasks, task]);
    await appendTaskLog(userName, taskData.title, task.id);
    setShowAddModal(false);
  }

  async function editTask(id, taskData) {
    const existing = tasks.find((task) => task.id === id);
    if (!existing) return;
    await cancelNotification(existing.notificationId);
    const updated = {
      ...existing,
      ...taskData,
      notificationId: null,
      activityLog: [
        ...(existing.activityLog || []),
        { id: generateId(), text: 'Task edited', timestamp: new Date().toISOString() },
      ],
    };
    updated.notificationId = await scheduleTaskNotification(updated);
    const nextTasks = tasks.map((task) => (task.id === id ? updated : task));
    await persist(nextTasks);
    setSelectedTask(updated);
    setShowEditModal(false);
  }

  async function deleteTask(id) {
    const existing = tasks.find((task) => task.id === id);
    if (!existing) return;
    await cancelNotification(existing.notificationId);
    const nextTasks = tasks.filter((task) => task.id !== id);
    await persist(nextTasks);
    setShowDetailModal(false);
    setShowEditModal(false);
    setSelectedTask(null);
  }

  function confirmDelete(id) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete this task? This removes the task, comments, activity, and reminder.')) {
        deleteTask(id);
      }
      return;
    }
    Alert.alert('Delete task?', 'This removes the task, comments, activity, and reminder.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTask(id) },
    ]);
  }

  function showIncompleteAlert() {
    Alert.alert(
      'Task is not completed yet',
      'Open the task details and use "Mark as Completed" when the work is actually finished.',
    );
  }

  async function moveTask(id, newStatus) {
    const nextTasks = tasks.map((task) => {
      if (task.id !== id || task.status === newStatus) return task;
      const label = newStatus === 'IN_PROGRESS' ? 'In Progress' : newStatus === 'COMPLETED' ? 'Completed' : 'To Do';
      return {
        ...task,
        status: newStatus,
        activityLog: [
          ...(task.activityLog || []),
          { id: generateId(), text: `Moved to ${label}`, timestamp: new Date().toISOString() },
        ],
      };
    });
    await persist(nextTasks);
    const updated = nextTasks.find((task) => task.id === selectedTask?.id);
    if (updated) setSelectedTask(updated);
  }

  async function addComment(taskId, text) {
    const nextTasks = tasks.map((task) => {
      if (task.id !== taskId) return task;
      return {
        ...task,
        comments: [
          ...(task.comments || []),
          { id: generateId(), author: userName || 'User', text, timestamp: new Date().toISOString() },
        ],
        activityLog: [
          ...(task.activityLog || []),
          { id: generateId(), text: `${userName || 'User'} added a comment`, timestamp: new Date().toISOString() },
        ],
      };
    });
    await persist(nextTasks);
    setSelectedTask(nextTasks.find((task) => task.id === taskId) || null);
  }

  function detectDropColumn(x, y) {
    return Object.entries(columnLayouts).find(([, layout]) => (
      x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height
    ))?.[0] || null;
  }

  function handleCardDrop(id, x, y) {
    const status = detectDropColumn(x, y);
    const task = tasks.find((item) => item.id === id);
    if (status === 'COMPLETED' && task?.status !== 'COMPLETED') {
      showIncompleteAlert();
    } else if (status) {
      moveTask(id, status);
    }
    setDraggingTaskId(null);
  }

  function handleColumnLayout(status, layout) {
    setColumnLayouts((current) => ({ ...current, [status]: layout }));
  }

  function openTask(task) {
    setSelectedTask(task);
    setShowDetailModal(true);
  }

  function handleCardLongPress(task) {
    const actions = [
      {
        text: 'Edit',
        onPress: () => {
          setSelectedTask(task);
          setShowDetailModal(false);
          setShowEditModal(true);
        },
      },
      { text: 'Move to In Progress', onPress: () => moveTask(task.id, 'IN_PROGRESS') },
      { text: 'Move to Completed', onPress: () => showIncompleteAlert() },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(task.id) },
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert(task.title, 'Choose an action', actions);
  }

  async function submitName() {
    const cleanName = nameInput.trim();
    if (!cleanName) {
      Alert.alert('Name required', 'Please enter your name to continue.');
      return;
    }
    await saveUserName(cleanName);
    setUserName(cleanName);
    setShowNameModal(false);
  }

  async function showTaskLog() {
    const log = await readTaskLog();
    Alert.alert('Activity Log File', log);
  }

  async function fireDebugNotification() {
    const title = '🧪 Test Notification';
    const body = `This is a test — simulating +${debugOffsetDays} days.`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const permission = window.Notification.permission === 'default'
          ? await window.Notification.requestPermission()
          : window.Notification.permission;
        if (permission === 'granted') {
          new window.Notification(title, { body });
        }
      }
      Alert.alert(title, body);
      return;
    }

    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Notifications disabled', 'Enable notification permission for this app, then try again.');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
      },
      trigger: { seconds: 1 },
    });
  }

  const renderDebugPanel = () => {
    if (!__DEV__) return null;
    const setOffset = (days) => setDebugOffsetDays(days);
    return (
      <View style={styles.debugPanel}>
        <Text style={styles.debugTitle}>🧪 Test Mode</Text>
        <Text style={styles.debugText}>Simulating: +{debugOffsetDays} days from today</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.debugButtonRow}>
          <Pressable style={styles.debugButton} onPress={() => setDebugOffsetDays((prev) => prev - 1)}>
            <Text style={styles.debugButtonText}>-1 day</Text>
          </Pressable>
          <Pressable style={styles.debugButton} onPress={() => setOffset(0)}>
            <Text style={styles.debugButtonText}>Today</Text>
          </Pressable>
          <Pressable style={styles.debugButton} onPress={() => setDebugOffsetDays((prev) => prev + 1)}>
            <Text style={styles.debugButtonText}>+1 day</Text>
          </Pressable>
          {[2, 4, 7, 14].map((days) => (
            <Pressable key={days} style={styles.debugButton} onPress={() => setOffset(days)}>
              <Text style={styles.debugButtonText}>+{days}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.debugNotifyButton} onPress={fireDebugNotification}>
          <Text style={styles.debugNotifyText}>🔔 Fire Test Notification Now</Text>
        </Pressable>
      </View>
    );
  };

  const renderBoard = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardScroll}>
      {COLUMNS.map((column) => (
        <BoardColumn
          key={column.status}
          title={column.title}
          status={column.status}
          tasks={tasks.filter((task) => task.status === column.status)}
          columnColor={column.color}
          columnWidth={boardColumnWidth}
          onAddTask={() => setShowAddModal(true)}
          onCardPress={openTask}
          onCardLongPress={handleCardLongPress}
          onDragStart={setDraggingTaskId}
          onCardDrop={(first, second, third) => {
            if (typeof first === 'string' && typeof second === 'object') handleColumnLayout(first, second);
            if (typeof second === 'number') handleCardDrop(first, second, third);
          }}
          columnRef={columnRefs[column.status]}
          nowOverride={effectiveNow}
        />
      ))}
    </ScrollView>
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>Nabiul's Task Manager</Text>
            <Text style={styles.subTitle}>A Complete Task Manager Application</Text>
          </View>
          <View style={styles.headerActions}>
            <Text style={styles.greeting}>{userName ? `Hi, ${userName} 👋` : 'Welcome'}</Text>
            <Pressable style={styles.logButton} onPress={showTaskLog}>
              <Text style={styles.logButtonText}>📄 View Log</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.toggleRow}>
          <Pressable style={[styles.toggle, view === 'board' ? styles.toggleActive : styles.toggleInactive]} onPress={() => setView('board')}>
            <Text style={view === 'board' ? styles.toggleActiveText : styles.toggleText}>Board View</Text>
          </Pressable>
          <Pressable style={[styles.toggle, view === 'list' ? styles.toggleActive : styles.toggleInactive]} onPress={() => setView('list')}>
            <Text style={view === 'list' ? styles.toggleActiveText : styles.toggleText}>List View</Text>
          </Pressable>
        </View>
        {view === 'list' ? <SortChipBar sortBy={sortBy} onSortChange={setSortBy} /> : null}
        {view === 'board' ? renderBoard() : (
          <FlatList
            data={sortedTasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => <ListViewItem task={item} onPress={openTask} nowOverride={effectiveNow} />}
            ListEmptyComponent={<Text style={styles.emptyText}>No tasks yet. Switch to Board and add your first task.</Text>}
          />
        )}
        {renderDebugPanel()}
        <AddTaskModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={addTask}
          onTestNotification={testNotification}
        />
        <AddTaskModal
          visible={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSubmit={(taskData) => editTask(selectedTaskLive.id, taskData)}
          onTestNotification={testNotification}
          initialTask={selectedTaskLive}
          submitLabel="Save Changes"
        />
        <TaskDetailModal
          task={selectedTaskLive}
          visible={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          onEdit={(task) => {
            setSelectedTask(task);
            setShowDetailModal(false);
            setShowEditModal(true);
          }}
          onDelete={confirmDelete}
          onComplete={(id) => moveTask(id, 'COMPLETED')}
          onAddComment={addComment}
          currentUser={userName || 'User'}
          nowOverride={effectiveNow}
        />
        <Modal visible={showNameModal} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.nameOverlay}>
            <View style={styles.nameModal}>
              <Text style={styles.nameTitle}>Welcome to Nabiul's Task Manager</Text>
              <Text style={styles.nameCopy}>Enter your name for comments and activity logs.</Text>
              <TextInput
                style={styles.nameInput}
                placeholder="Your name"
                placeholderTextColor="#94A3B8"
                value={nameInput}
                onChangeText={setNameInput}
                onSubmitEditing={submitName}
              />
              <Pressable style={styles.nameButton} onPress={submitName}>
                <Text style={styles.nameButtonText}>Continue</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appName: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: '900',
  },
  boardScroll: {
    flexGrow: 1,
    paddingBottom: 22,
    paddingHorizontal: 18,
  },
  container: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 15,
    marginTop: 60,
    textAlign: 'center',
  },
  debugButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  debugButtonRow: {
    paddingTop: 8,
  },
  debugButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
  },
  debugNotifyButton: {
    alignItems: 'center',
    borderColor: COLORS.completed,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingVertical: 9,
  },
  debugNotifyText: {
    color: COLORS.completed,
    fontSize: 12,
    fontWeight: '900',
  },
  debugPanel: {
    backgroundColor: '#111827',
    borderColor: COLORS.border,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  debugText: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  debugTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
  },
  greeting: {
    color: COLORS.text,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  headerActions: {
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 8,
  },
  listContent: {
    paddingBottom: 28,
    paddingHorizontal: 18,
  },
  logButton: {
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  logButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '900',
  },
  nameButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  nameButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  nameCopy: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  nameModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    width: '88%',
  },
  nameOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    flex: 1,
    justifyContent: 'center',
  },
  nameTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  root: {
    flex: 1,
  },
  subTitle: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  toggle: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    paddingVertical: 12,
  },
  toggleActive: {
    backgroundColor: COLORS.primary,
  },
  toggleActiveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  toggleInactive: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 14,
    paddingHorizontal: 18,
  },
  toggleText: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: '900',
  },
});
