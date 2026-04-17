import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { LogOut, Users, Clock, AlertTriangle, Search } from 'lucide-react';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [allFaculty, setAllFaculty] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');

  const todayDateString = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
        const usersQ = query(collection(db, 'users'), where('role', '==', 'faculty'));
        const usersSnap = await getDocs(usersQ);
        const facultyList = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllFaculty(facultyList);

        const attQ = query(collection(db, 'attendance'), where('dateString', '==', todayDateString));
        const attSnap = await getDocs(attQ);
        const records = attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAttendanceRecords(records);
        
    } catch (error) {
        console.error("Error fetching admin data", error);
    } finally {
        setLoading(false);
    }
  };

  const presentRecords = attendanceRecords.filter(r => r.status === 'Present');
  const lateRecords = attendanceRecords.filter(r => r.status === 'Late');
  const presentIds = attendanceRecords.map(r => r.userId);
  const absentFaculty = allFaculty.filter(f => !presentIds.includes(f.id));

  // Combine for table display & searching
  const combinedList = [
      ...attendanceRecords.map(r => ({ ...r, facultyEmail: r.email, isAbsent: false })),
      ...absentFaculty.map(f => ({ id: f.id, facultyEmail: f.email, isAbsent: true, status: 'Absent' }))
  ];

  const filteredList = combinedList.filter(item => 
      item.facultyEmail?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.status?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
        <header className="flex justify-between items-center mb-8 glass-card" style={{ padding: '1.5rem 2.5rem' }}>
            <div>
                <h1 className="gradient-text" style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Administrator Portal</h1>
                <span className="text-muted" style={{ fontSize: '0.95rem' }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <button onClick={logout} className="btn btn-outline" style={{ padding: '0.75rem 1.25rem' }}>
                <LogOut size={18} /> Logout
            </button>
        </header>

        {loading ? (
            <div className="text-center mt-8">Loading real-time dashboard data...</div>
        ) : (
            <>
                <div className="stats-grid">
                    <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
                        <div className="flex items-center gap-3 mb-2">
                            <Users size={24} className="text-success" />
                            <h4 style={{ color: 'var(--text-muted)' }}>Present Today</h4>
                        </div>
                        <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>{presentRecords.length}</span>
                    </div>
                    
                    <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                        <div className="flex items-center gap-3 mb-2">
                            <Clock size={24} className="text-warning" />
                            <h4 style={{ color: 'var(--text-muted)' }}>Late Arrivals</h4>
                        </div>
                        <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>{lateRecords.length}</span>
                    </div>

                    <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
                        <div className="flex items-center gap-3 mb-2">
                            <AlertTriangle size={24} className="text-danger" />
                            <h4 style={{ color: 'var(--text-muted)' }}>Absent Faculty</h4>
                        </div>
                        <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>{absentFaculty.length}</span>
                    </div>
                </div>

                <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div className="flex justify-between items-center" style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.2)', flexWrap: 'wrap', gap: '1rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Live Attendance Feed</h2>
                        <div className="search-bar">
                            <Search size={18} className="text-muted" />
                            <input 
                                type="text" 
                                placeholder="Search faculty or status..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Faculty Member</th>
                                    <th>Check In</th>
                                    <th>Check Out</th>
                                    <th>Live Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredList.map((record) => (
                                    <tr key={record.id}>
                                        <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'white' }}>
                                                {record.facultyEmail?.charAt(0).toUpperCase()}
                                            </div>
                                            {record.facultyEmail}
                                        </td>
                                        <td>{record.isAbsent ? '--:--' : (record.checkinTime || '--:--')}</td>
                                        <td>{record.isAbsent ? '--:--' : (record.checkoutTime || '--:--')}</td>
                                        <td>
                                            <span className={`status-badge status-${record.status?.toLowerCase() || 'present'}`}>
                                                {record.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {filteredList.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="text-center text-muted" style={{ padding: '3rem' }}>
                                            No tracking records match your search criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        )}
    </div>
  );
}
