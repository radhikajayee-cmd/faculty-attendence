import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase/firebaseConfig';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [loading, setLoading] = useState(true);

    const checkUserRole = async (uid) => {
        try {
            console.log("Checking role for UID:", uid);
            const docRef = doc(db, 'users', uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                console.log("Role found:", docSnap.data().role);
                setUserRole(docSnap.data().role);
            } else {
                console.warn("No role found. Defaulting to faculty.");
                setUserRole('faculty'); 
            }
        } catch (error) {
            console.error("Critical Error fetching role from Firestore:", error);
            // Fallback to faculty so UI is not blocked if Firestore rules/cache fail briefly
            setUserRole('faculty');
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            console.log("Auth state changed. Current User:", currentUser?.email);
            setUser(currentUser);
            if (currentUser) {
                await checkUserRole(currentUser.uid);
            } else {
                setUserRole(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const login = (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const signUp = async (email, password) => {
        console.log("Initiating sign up...");
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const currentUser = result.user;
        
        try {
            console.log("Creating user document in Firestore...");
            await setDoc(doc(db, 'users', currentUser.uid), {
                email: currentUser.email,
                role: 'faculty', // Always create a faculty role for new signups
                createdAt: new Date().toISOString()
            });
            console.log("Firestore document created successfully.");
        } catch (err) {
            console.error("Error creating Firestore user document:", err);
            // Even if DB fails, they are an authed user.
        }
        
        setUserRole('faculty');
        return result;
    };

    const loginWithGoogle = async () => {
        console.log("Initiating Google Sign-In...");
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const currentUser = result.user;
        
        try {
            const docRef = doc(db, 'users', currentUser.uid);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                console.log("New Google User: Creating Firestore record.");
                await setDoc(docRef, {
                    email: currentUser.email,
                    role: 'faculty',
                    createdAt: new Date().toISOString()
                });
                setUserRole('faculty');
            } else {
                console.log("Existing Google User:", docSnap.data().role);
                setUserRole(docSnap.data().role);
            }
        } catch (err) {
            console.error("Error querying/setting Google user doc", err);
            setUserRole('faculty');
        }
        return result;
    };

    const logout = () => {
        return signOut(auth);
    };

    const value = {
        user,
        userRole,
        login,
        signUp,
        loginWithGoogle,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
