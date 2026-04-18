import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase/firebaseConfig';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { savePendingSync, syncPendingRecords } from '../utils/syncManager';
import { CheckCircle2, XCircle, LogOut, WifiOff, Wifi, Clock, CalendarDays, Activity } from 'lucide-react';

export default function FacultyDashboard() {
  const { user, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [attendanceState, setAttendanceState] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('');
  
  // Premium Features State
  const [recentLogs, setRecentLogs] = useState([]);
  const [stats, setStats] = useState({ total: 0, onTime: 0, late: 0 });

  const todayDateString = new Date().toLocaleDateString('en-CA'); // e.g. YYYY-MM-DD local

  useEffect(() => {
    const handleOnline = () => {
        setIsOnline(true);
        triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    fetchDashboardData();
    if (navigator.onLine) triggerSync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  const triggerSync = async () => {
      setSyncStatus('Syncing pending records...');
      const syncedCount = await syncPendingRecords();
      if (syncedCount && syncedCount > 0) {
          setSyncStatus(`Successfully synced ${syncedCount} records!`);
          setTimeout(() => setSyncStatus(''), 3000);
          fetchDashboardData();
      } else {
          setSyncStatus('');
      }
  };

  const fetchDashboardData = async () => {
    // Robust Failsafe: Never let it hang infinitely.
    const watchdog = setTimeout(() => {
        console.warn("Firebase took too long to respond. Force-loading UI...");
        setLoading(false);
    }, 2500);

    try {
        if (!user || !user.uid) {
            console.error("No user found!");
            return;
        }

        const attRef = collection(db, 'attendance');
        
        // Fetch ALL records for this user (Single-field query, no composite index needed)
        const qAll = query(attRef, where('userId', '==', user.uid));
        const allSnap = await getDocs(qAll);
        
        let fetchedLogs = [];
        let sTotal = 0, sOnTime = 0, sLate = 0;
        let todayData = null;

        allSnap.forEach((doc) => {
            const d = doc.data();
            fetchedLogs.push({ id: doc.id, ...d });
            
            // Stats
            sTotal++;
            if (d.status === 'Present') sOnTime++;
            if (d.status === 'Late') sLate++;
        });

        // 1. Sort trailing logs manually (to avoid orderBy index request)
        fetchedLogs.sort((a, b) => b.timestamp - a.timestamp);

        // 2. Find the most recent log for today
        const latestTodayLog = fetchedLogs.find(log => log.dateString === todayDateString);

        if (latestTodayLog) {
            // Keep 'checked-out' state so the UI can show the Shift Completed badge
            setAttendanceState(latestTodayLog.checkoutTime ? 'checked-out' : 'checked-in');
        } else {
            setAttendanceState(null);
        }

        // 3. Take top 7 for recent display
        setRecentLogs(fetchedLogs.slice(0, 7));
        setStats({ total: sTotal, onTime: sOnTime, late: sLate });

    } catch (error) {
        console.error("Error fetching dashboard data:", error);
    } finally {
        clearTimeout(watchdog);
        setLoading(false);
    }
  };



  const markAttendance = async (type) => {
    try {
        setLoading(true);
        const now = new Date();
        const nowTime = now.toLocaleTimeString();
        const hours = now.getHours();

        // Prevent invalid check-ins/check-outs outside of normal working hours (e.g. 6 AM to 9 PM)
        if (hours < 6 || hours >= 21) {
            alert("Attendance can only be marked during official working hours (6:00 AM - 9:00 PM).");
            setLoading(false);
            return;
        }

        const record = {
            userId: user.uid,
            email: user.email || 'No Email',
            dateString: todayDateString,
            type: type,
            timestamp: Date.now() // Local fallback
        };

        if (type === 'checkin') {
            record.checkinTime = nowTime;
            
            const deadline = new Date();
            deadline.setHours(10, 0, 0, 0);
            
            const maxLate = new Date();
            maxLate.setHours(10, 15, 0, 0);

            let currentStatus = 'Present';
            let minutesLate = 0;
            let lateMessageForAlert = '';

            if (now > deadline) {
                minutesLate = Math.ceil((now - deadline) / (1000 * 60));
                
                let lateTimeStr = "";
                const hoursLate = Math.floor(minutesLate / 60);
                const remainingMinutes = minutesLate % 60;
                if (hoursLate > 0) {
                    lateTimeStr = `${hoursLate} hour${hoursLate > 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
                } else {
                    lateTimeStr = `${minutesLate} minute${minutesLate !== 1 ? 's' : ''}`;
                }
                
                if (now > maxLate) {
                    alert(`You are late by ${lateTimeStr}. Extending 15 minutes of late arrival is not permitted. You cannot check in today.`);
                    setLoading(false);
                    return;
                } else {
                    currentStatus = 'Late';
                    lateMessageForAlert = `You have arrived late by ${lateTimeStr}.`;
                }

                // Show Popup
                alert(lateMessageForAlert);
                
                if (isOnline) {
                    try {
                        const attRef = collection(db, 'attendance');
                        const qPast = query(attRef, where('userId', '==', user.uid));
                        const pastSnap = await getDocs(qPast);
                        
                        let allRecords = [];
                        pastSnap.forEach(doc => {
                            const data = doc.data();
                            if (data.dateString !== todayDateString) {
                                allRecords.push(data);
                            }
                        });
                        
                        allRecords.sort((a, b) => b.timestamp - a.timestamp);
                        const previousRecord = allRecords.length > 0 ? allRecords[0] : null;

                        let isConsecutiveLate = false;
                        if (previousRecord && ['Late', 'Half CL', 'Grace'].includes(previousRecord.status)) {
                            isConsecutiveLate = true;
                        }

                        let emailMessage = `Dear Faculty,\n\n${lateMessageForAlert}\n\nPlease try to arrive on time.`;
                        if (isConsecutiveLate) {
                            emailMessage += `\n\nWARNING: You have been arriving late continuously. Please note that this is being monitored and the administration has been notified.`;
                        }

                        // Send Email to Faculty
                        fetch("https://formsubmit.co/ajax/" + user.email, {
                            method: "POST",
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({
                                _subject: isConsecutiveLate ? `WARNING: Continuous Late Arrival Alert` : `Late Arrival Alert`,
                                name: "Admin - Faculty Attendance System",
                                email: user.email,
                                message: emailMessage
                            })
                        }).catch(err => console.error(err));
                        
                        // If continuous, send warning to Admin
                        if (isConsecutiveLate) {
                            fetch("https://formsubmit.co/ajax/radhikajayee@gmail.com", {
                                method: "POST",
                                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                body: JSON.stringify({
                                    _subject: `Continuous Late Alert: ${user.email}`,
                                    name: "Faculty Attendance System",
                                    email: user.email,
                                    message: `Faculty member (${user.email}) is late again today by ${lateTimeStr}.\n\nThey are repeating this continuously (their previous check-in was also marked as late).\nToday's Status: ${currentStatus}`
                                })
                            }).catch(err => console.error(err));
                        } else if (currentStatus === 'Half CL') {
                            fetch("https://formsubmit.co/ajax/radhikajayee@gmail.com", {
                                method: "POST",
                                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                body: JSON.stringify({
                                    _subject: `Faculty Half CL Alert: ${user.email}`,
                                    name: "Faculty Attendance System",
                                    email: user.email,
                                    message: `Faculty member (${user.email}) arrived late by ${lateTimeStr} (>15m limit).\n\nTheir attendance for today has been automatically marked as Half CL.`
                                })
                            }).catch(err => console.error(err));
                        }
                    } catch (err) {
                        console.error("Error checking continuous late:", err);
                    }
                }
            }
            
            record.status = currentStatus;
        } else {
            record.checkoutTime = nowTime;
        }

        if (!isOnline) {
            await savePendingSync(record);
            setAttendanceState(type === 'checkin' ? 'checked-in' : 'checked-out');
            setSyncStatus('Pending Sync (Offline Mode)');
        } else {
            const attendanceRef = collection(db, 'attendance');
            
            if (type === 'checkin') {
                await addDoc(attendanceRef, { ...record, serverTime: serverTimestamp() });
                setAttendanceState('checked-in');

                // Send real-time email notification to Admin for Check-in
                fetch("https://formsubmit.co/ajax/radhikajayee@gmail.com", {
                    method: "POST",
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        _subject: `Faculty Check-In Alert: ${user.email}`,
                        name: "Faculty Attendance System",
                        email: user.email,
                        message: `Faculty member (${user.email}) checked in successfully.\n\nDate: ${todayDateString}\nTime: ${nowTime}\nStatus: ${record.status}`
                    })
                }).catch(err => console.error("Failed to send email notification:", err));

            } else {
                // Use the local state to find today's check-in ID instantly
                const todayLog = recentLogs.find(log => log.dateString === todayDateString);
                
                if (todayLog && todayLog.id) {
                    const docRef = doc(db, 'attendance', todayLog.id);
                    
                    const updateData = { checkoutTime: nowTime, serverTime: serverTimestamp() };
                    
                    const fivePM = new Date();
                    fivePM.setHours(17, 0, 0, 0);

                    // Check-out Rules
                    if (now > fivePM) {
                        alert("You are attempting to check out after 5:00 PM. Check-out is not permitted after this time.");
                        setLoading(false);
                        return;
                    }

                    await updateDoc(docRef, updateData);
                    setAttendanceState('checked-out');
                    
                    // Send real-time email notification to Admin for Checkout
                    fetch("https://formsubmit.co/ajax/radhikajayee@gmail.com", {
                        method: "POST",
                        headers: { 
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            _subject: `Faculty Check-Out Alert: ${user.email}`,
                            name: "Faculty Attendance System",
                            email: user.email,
                            message: `Faculty member (${user.email}) checked out successfully.\n\nDate: ${todayDateString}\nCheck-Out Time: ${nowTime}`
                        })
                    }).catch(err => console.error("Failed to send checkout email notification:", err));

                } else {
                    alert("Could not find today's active check-in record. Have you checked in?");
                    setLoading(false);
                    return;
                }
            }
        }
        
        // Refresh local UI stats to display Checkout Time instantly
        await fetchDashboardData();
    } catch (err) {
        console.error("Could not record:", err);
        alert("Error: " + err.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div>
        <header className="flex justify-between items-center mb-8 glass-card" style={{ padding: '1.5rem 2.5rem' }}>
            <div>
                <h1 className="gradient-text" style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
                    Welcome Back, {user?.email ? user.email.split('@')[0] : 'Faculty'}
                </h1>
                <span className="text-muted" style={{ fontSize: '0.95rem' }}>Faculty Dashboard</span>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem 1rem', borderRadius: '12px' }}>
                    {isOnline ? <Wifi size={18} className="text-success" /> : <WifiOff size={18} className="text-danger" />}
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }} className={isOnline ? "text-success" : "text-danger"}>
                        {isOnline ? 'Online Sync Active' : 'Offline Mode Active'}
                    </span>
                </div>
                <button onClick={logout} className="btn btn-outline">
                    <LogOut size={18} /> Logout
                </button>
            </div>
        </header>

        {syncStatus && (
            <div className={`sync-banner ${syncStatus.includes('Pending') ? 'offline' : 'synced'} mb-6`} style={{ borderRadius: '12px', padding: '1rem', fontSize: '1rem' }}>
                {syncStatus}
            </div>
        )}

        {/* Premium Stats Grid */}
        <div className="stats-grid">
            <div className="stat-card">
                <div className="flex items-center gap-3 mb-4">
                    <CalendarDays className="text-primary" />
                    <h4 style={{ color: 'var(--text-muted)' }}>Days Present (7 Days)</h4>
                </div>
                <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>{stats.total}</span>
            </div>
            <div className="stat-card">
                <div className="flex items-center gap-3 mb-4">
                    <Activity className="text-success" />
                    <h4 style={{ color: 'var(--text-muted)' }}>On-Time Rate</h4>
                </div>
                <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>
                    {stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0}%
                </span>
            </div>
            <div className="stat-card">
                <div className="flex items-center gap-3 mb-4">
                    <Clock className="text-warning" />
                    <h4 style={{ color: 'var(--text-muted)' }}>Late Arrivals</h4>
                </div>
                <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>{stats.late}</span>
            </div>
        </div>

        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            {/* Mark Attendance Card */}
            <div className="glass-card text-center flex-1" style={{ minWidth: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h2 style={{ fontSize: '3.5rem', fontWeight: '800', marginBottom: '0.25rem', letterSpacing: '-0.05em' }}>
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </h2>
                <p className="text-muted mb-8" style={{ fontSize: '1.1rem' }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

                <div className="flex flex-col gap-4">
                    {loading ? (
                        <div style={{ padding: '2rem' }}>Syncing data securely...</div>
                    ) : (
                        <>
                            <button 
                                disabled={attendanceState === 'checked-in'}
                                onClick={() => markAttendance('checkin')}
                                className="btn btn-success" 
                                style={{ padding: '1.25rem', fontSize: '1.2rem', borderRadius: '16px' }}
                            >
                                <CheckCircle2 size={26} /> {attendanceState === 'checked-in' ? 'Checked In Successfully' : 'Check In Now'}
                            </button>
                            
                            <button 
                                disabled={attendanceState !== 'checked-in'}
                                onClick={() => markAttendance('checkout')}
                                className="btn btn-danger" 
                                style={{ padding: '1.25rem', fontSize: '1.2rem', borderRadius: '16px' }}
                            >
                                <XCircle size={26} /> Check Out for the Day
                            </button>

                            <div className="mt-6">
                                {attendanceState === 'checked-in' && <span className="status-badge status-present" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Active Duty</span>}
                                {attendanceState === 'checked-out' && <span className="status-badge status-late" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Shift Completed</span>}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Recent Logs Table */}
            <div className="glass-card flex-2" style={{ flex: '2', minWidth: '400px', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.2)' }}>
                    <h3 style={{ fontSize: '1.25rem' }}>Recent History</h3>
                </div>
                <div className="table-container" style={{ border: 'none', borderRadius: 0, flex: 1 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Check In</th>
                                <th>Check Out</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentLogs.map((log, idx) => (
                                <tr key={idx}>
                                    <td style={{ fontWeight: 500 }}>{log.dateString}</td>
                                    <td>{log.checkinTime || '--:--'}</td>
                                    <td>{log.checkoutTime || '--:--'}</td>
                                    <td>
                                        <span className={`status-badge status-${log.status?.toLowerCase().replace(/\s+/g, '-') || 'present'}`}>
                                            {log.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {recentLogs.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="text-center text-muted" style={{ padding: '3rem' }}>
                                        No recent attendance records found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
  );
}
