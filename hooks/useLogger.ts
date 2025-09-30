
import { useState, useCallback } from 'react';
import type { LogEntry } from '../types';

export const useLogger = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            id: Date.now() + Math.random(),
            time: new Date().toISOString().substr(11, 8),
            message,
        };
        setLogs(prevLogs => [newLog, ...prevLogs].slice(0, 100)); // Keep last 100 logs
    }, []);

    return { logs, addLog };
};
