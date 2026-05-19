import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const TASKS_KEY = 'tasks';
const USER_NAME_KEY = 'userName';
const LOG_PATH = FileSystem.documentDirectory + 'log.txt';
const ROOT_LOG_SERVER_URL = 'http://localhost:3001/log-task';

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

function buildTaskLogLine(userName, taskTitle, taskId) {
  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    `[${timestamp}] ` +
    `USER: "${userName || 'Unknown'}" | ` +
    `CREATED TASK: "${taskTitle}" | ` +
    `TASK_ID: ${taskId}\n`
  );
}

async function appendRootTaskLog(line) {
  if (!__DEV__) return false;

  try {
    const response = await fetch(ROOT_LOG_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function readRootTaskLog() {
  if (!__DEV__) return null;

  try {
    const response = await fetch(ROOT_LOG_SERVER_URL);
    if (!response.ok) return null;
    const data = await response.json();
    return data.content || 'No log entries yet.';
  } catch {
    return null;
  }
}

export async function appendTaskLog(userName, taskTitle, taskId) {
  try {
    const line = buildTaskLogLine(userName, taskTitle, taskId);

    // Try root log server first (dev mode only)
    if (await appendRootTaskLog(line)) {
      console.log('[ROOT LOG APPENDED]', line.trim());
      return;
    }

    // Fallback: write to local file system
    try {
      let existing = '';
      try {
        const info = await FileSystem.getInfoAsync(LOG_PATH);
        if (info.exists) {
          existing = await FileSystem.readAsStringAsync(LOG_PATH);
        }
      } catch {
        existing = '';
      }

      await FileSystem.writeAsStringAsync(LOG_PATH, existing + line);
      console.log('[LOG APPENDED]', line.trim());
    } catch (fsError) {
      console.warn('File system log write failed:', fsError);
      // Last resort: try writing to a simple text file in document root
      try {
        const simpleLogPath = FileSystem.documentDirectory + 'tasks.log';
        let simpleExisting = '';
        try {
          const info = await FileSystem.getInfoAsync(simpleLogPath);
          if (info.exists) {
            simpleExisting = await FileSystem.readAsStringAsync(simpleLogPath);
          }
        } catch {
          simpleExisting = '';
        }
        await FileSystem.writeAsStringAsync(simpleLogPath, simpleExisting + line);
        console.log('[SIMPLE LOG APPENDED]', line.trim());
      } catch (simpleFsError) {
        console.error('All logging methods failed:', simpleFsError);
      }
    }
  } catch (error) {
    console.warn('Log write failed:', error);
  }
}

export async function readTaskLog() {
  try {
    const rootLog = await readRootTaskLog();
    if (rootLog !== null) return rootLog;

    const info = await FileSystem.getInfoAsync(LOG_PATH);
    if (!info.exists) return 'No log entries yet.';
    return await FileSystem.readAsStringAsync(LOG_PATH);
  } catch {
    return 'Failed to read log.';
  }
}

export function getLogPath() {
  return __DEV__ ? 'MAD_Assignment/log.txt' : LOG_PATH;
}
