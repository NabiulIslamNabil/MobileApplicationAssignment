import AsyncStorage from '@react-native-async-storage/async-storage';

const TASKS_KEY = 'tasks';
const USER_NAME_KEY = 'userName';

export async function loadTasks() {
  try {
    const raw = await AsyncStorage.getItem(TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Unable to load tasks', error);
    return [];
  }
}

export async function saveTasks(tasks) {
  try {
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn('Unable to save tasks', error);
  }
}

export async function loadUserName() {
  try {
    return await AsyncStorage.getItem(USER_NAME_KEY);
  } catch (error) {
    console.warn('Unable to load user name', error);
    return null;
  }
}

export async function saveUserName(name) {
  try {
    await AsyncStorage.setItem(USER_NAME_KEY, name);
  } catch (error) {
    console.warn('Unable to save user name', error);
  }
}

export function generateId() {
  return `${Date.now().toString()}-${Math.random().toString(36).slice(2, 10)}`;
}
