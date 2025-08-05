import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, query, where, setDoc, getDocs } from 'firebase/firestore';

// Konfigurasi Firebase dari Environment Variables
const firebaseConfig = process.env.REACT_APP_FIREBASE_CONFIG ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG) : {};
const appId = process.env.REACT_APP_APP_ID || 'default-app-id';

// Konteks untuk mengelola status pengguna dan aplikasi secara global
const AppContext = createContext();

// Komponen Modal yang dapat digunakan kembali untuk konfirmasi
const Modal = ({ show, title, message, onConfirm, onCancel }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
                <h3 className="text-xl font-bold text-gray-800 mb-4">{title}</h3>
                <p className="text-gray-600 mb-6">{message}</p>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                    >
                        Batal
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
                    >
                        Konfirmasi
                    </button>
                </div>
            </div>
        </div>
    );
};

const AppProvider = ({ children }) => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [users, setUsers] = useState([]);
    const [storeSettings, setStoreSettings] = useState({});
    const [currentPage, setCurrentPage] = useState('orders');
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (Object.keys(firebaseConfig).length > 0 && !hasInitialized.current) {
            hasInitialized.current = true;
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestore);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    signInAnonymously(firebaseAuth).catch(err => console.error("Anonymous sign-in failed:", err));
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe();
        }
    }, []);

    useEffect(() => {
        if (!db || !isAuthReady) return;

        const setupListeners = async () => {
            const usersRef = collection(db, `artifacts/${appId}/public/data/users`);
            try {
                const querySnapshot = await getDocs(usersRef);
                if (querySnapshot.empty) {
                    await addDoc(usersRef, {
                        username: 'owner',
                        password: '123',
                        role: 'owner',
                        createdAt: new Date().toISOString(),
                        userId: null,
                    });
                }
            } catch (error) {
                console.error("Error checking or creating default user:", error);
            }
            const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
                const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setUsers(allUsers);
                const currentUserData = allUsers.find(u => u.userId === userId);
                setUserRole(currentUserData ? currentUserData.role : null);
            });

            const ordersRef = collection(db, `artifacts/${appId}/public/data/orders`);
            const productsRef = collection(db, `artifacts/${appId}/public/data/products`);
            const expensesRef = collection(db, `artifacts/${appId}/public/data/expenses`);
            const storeSettingsRef = doc(db, `artifacts/${appId}/public/data/storeSettings`, 'main');

            const unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubscribeProducts = onSnapshot(productsRef, (snapshot) => setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubscribeExpenses = onSnapshot(expensesRef, (snapshot) => setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

            const unsubscribeStoreSettings = onSnapshot(storeSettingsRef, (doc) => {
                if (doc.exists()) {
                    setStoreSettings(doc.data());
                } else {
                    const defaultSettings = { storeName: 'Toko Printing Anda', address: 'Jl. Contoh No. 123', phone: '081234567890', receiptNotes: 'Terima kasih atas kunjungan Anda!', logoUrl: 'https://placehold.co/200x100/000000/FFFFFF?text=Logo' };
                    setDoc(storeSettingsRef, defaultSettings).catch(err => console.error("Error creating default store settings:", err));
                    setStoreSettings(defaultSettings);
                }
            });

            return () => {
                unsubscribeOrders();
                unsubscribeProducts();
                unsubscribeExpenses();
                unsubscribeUsers();
                unsubscribeStoreSettings();
            };
        };

        setupListeners();
    }, [db, isAuthReady, userId]);

    const handleLogout = async () => {
        if (!auth || !db || !userId) return;
        try {
            const currentUserDoc = users.find(u => u.userId === userId);
            if (currentUserDoc) {
                const userDocRef = doc(db, `artifacts/${appId}/public/data/users`, currentUserDoc.id);
                await updateDoc(userDocRef, { userId: null });
            }
            await signOut(auth);
            setUserRole(null);
            setCurrentPage('orders');
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    const value = { db, auth, userId, userRole, isAuthReady, orders, products, expenses, users, storeSettings, currentPage, setCurrentPage, appId, handleLogout };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export default function App() {
    return (
        <AppProvider>
            <div className="min-h-screen bg-gray-100 p-4 font-sans">
                <AppContent />
            </div>
        </AppProvider>
    );
}

const AppContent = () => {
    const { isAuthReady, userRole } = useContext(AppContext);
    if (!isAuthReady) return <div className="flex items-center justify-center h-screen text-xl font-semibold text-gray-700">Memuat aplikasi...</div>;
    if (!userRole) return <Login />;
    return (
        <div className="container mx-auto">
            <h1 className="text-4xl font-bold text-center text-gray-800 my-6">Aplikasi Printing</h1>
            <Navbar />
            <div className="mt-8"><MainContent /></div>
        </div>
    );
};

const MainContent = () => {
    const { currentPage } = useContext(AppContext);
    switch (currentPage) {
        case 'orders': return <OrdersPage />;
        case 'payments': return <PaymentsPage />;
        case 'expenses': return <ExpensesPage />;
        case 'reports': return <ReportsPage />;
        case 'account-management': return <AccountManagementPage />;
        case 'product-management': return <ProductManagementPage />;
        case 'store-management': return <StoreManagementPage />;
        default: return <OrdersPage />;
    }
};

const Navbar = () => {
    const { userRole, currentPage, setCurrentPage, handleLogout } = useContext(AppContext);
    const menuItems = [
        { name: 'Pesanan', page: 'orders', roles: ['kasir', 'desainer', 'superviser', 'owner'] },
        { name: 'Pembayaran', page: 'payments', roles: ['kasir', 'owner'] },
        { name: 'Pengeluaran', page: 'expenses', roles: ['kasir', 'superviser', 'owner'] },
        { name: 'Laporan', page: 'reports', roles: ['superviser', 'owner'] },
        { name: 'Manajemen Akun', page: 'account-management', roles: ['owner'] },
        { name: 'Manajemen Produk', page: 'product-management', roles: ['desainer', 'superviser', 'owner'] },
        { name: 'Manajemen Toko', page: 'store-management', roles: ['owner'] },
    ];
    return (
        <nav className="bg-white shadow-lg rounded-lg p-4">
            <ul className="flex flex-wrap justify-center items-center gap-4">
                {menuItems.map((item) => (
                    item.roles.includes(userRole) && (<li key={item.page}><button onClick={() => setCurrentPage(item.page)} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${currentPage === item.page ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>{item.name}</button></li>)
                ))}
                <li><button onClick={handleLogout} className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors">Logout</button></li>
            </ul>
        </nav>
    );
};

const Login = () => {
    const { db, appId, userId, isAuthReady, users } = useContext(AppContext);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!db || !isAuthReady) { setError('Aplikasi belum siap. Silakan coba lagi.'); return; }
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            try {
                const userDocRef = doc(db, `artifacts/${appId}/public/data/users`, user.id);
                await setDoc(userDocRef, { ...user, userId }, { merge: true });
            } catch (err) {
                console.error("Failed to update user document on login:", err);
                setError("Login gagal. Silakan coba lagi.");
            }
        } else { setError('Username atau password salah.'); }
    };
    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
                <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Login</h2>
                <form onSubmit={handleLogin}>
                    <div className="mb-4"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">Username</label><input type="text" id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" /></div>
                    <div className="mb-6"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">Password</label><input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" /></div>
                    {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
                    <div className="flex items-center justify-between"><button type="submit" className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-colors">Masuk</button></div>
                    <div className="mt-4 text-center text-sm text-gray-500"><p>Credentials: </p><p>Username: owner, Password: 123</p></div>
                </form>
            </div>
        </div>
    );
};

const OrdersPage = () => {
    const { db, appId, orders, products, userRole, storeSettings } = useContext(AppContext);
    const [isEditing, setIsEditing] = useState(false);
    const [currentOrder, setCurrentOrder] = useState({ customerName: '', items: [], totalCost: 0 });
    const [message, setMessage] = useState('');
    const [modal, setModal] = useState({ show: false, action: null, itemId: null });

    const generateOrderId = () => `P-${new Date().toISOString().replace(/[-:.]/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
    const handleAddOrderItem = () => setCurrentOrder(prev => ({ ...prev, items: [...prev.items, { productId: '', quantity: 1, width: 0, height: 0 }] }));
    const handleUpdateOrderItem = (index, key, value) => setCurrentOrder(prev => ({ ...prev, items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
    const handleRemoveOrderItem = (index) => setCurrentOrder(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    const calculateItemPrice = (item) => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return 0;
        switch (product.calculationMethod) {
            case 'dimensi': return item.width * item.height * product.price;
            case 'paket':
            case 'satuan': return item.quantity * product.price;
            default: return 0;
        }
    };

    useEffect(() => {
        const total = currentOrder.items.reduce((acc, item) => acc + calculateItemPrice(item), 0);
        setCurrentOrder(prev => ({ ...prev, totalCost: total }));
    }, [currentOrder.items, products]);

    const handleSubmitOrder = async (e) => {
        e.preventDefault();
        if (!db) return;
        try {
            if (isEditing) {
                await updateDoc(doc(db, `artifacts/${appId}/public/data/orders`, currentOrder.id), { ...currentOrder, items: JSON.stringify(currentOrder.items), updatedAt: new Date().toISOString() });
                setMessage('Pesanan berhasil diperbarui!');
            } else {
                const orderId = generateOrderId();
                await setDoc(doc(db, `artifacts/${appId}/public/data/orders`, orderId), { ...currentOrder, id: orderId, items: JSON.stringify(currentOrder.items), paymentStatus: 'Belum Lunas', paymentMethod: '', paidAmount: 0, createdAt: new Date().toISOString() });
                setMessage('Pesanan berhasil ditambahkan!');
            }
            setCurrentOrder({ customerName: '', items: [], totalCost: 0 });
            setIsEditing(false);
            setTimeout(() => setMessage(''), 3000);
        } catch (error) { console.error("Error saving order:", error); setMessage('Gagal menyimpan pesanan.'); }
    };

    const handleEditOrder = (order) => {
        const { paymentStatus, paymentMethod, paidAmount, ...rest } = order;
        setCurrentOrder({ ...rest, items: JSON.parse(order.items) });
        setIsEditing(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteOrder = async (id) => {
        if (!db) return;
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/public/data/orders`, id));
            setMessage('Pesanan berhasil dihapus.');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) { console.error("Error deleting order:", error); setMessage('Gagal menghapus pesanan.'); }
        setModal({ show: false, action: null, itemId: null });
    };

    const handlePrintReceipt = (order) => {
        const parsedItems = JSON.parse(order.items);
        const change = order.paidAmount > order.totalCost ? order.paidAmount - order.totalCost : 0;
        const remaining = order.totalCost - order.paidAmount > 0 ? order.totalCost - order.paidAmount : 0;
        let receiptContent = `<div style="font-family: monospace; font-size: 10px; width: 80mm; text-align: left; padding: 5mm;">${storeSettings.logoUrl ? `<img src="${storeSettings.logoUrl}" alt="Logo" style="max-width: 100px; margin: 0 auto 10px auto; display: block;"/>` : ''}<h2 style="text-align: center; margin: 0; font-size: 14px;">${storeSettings.storeName || 'Toko Printing'}</h2><p style="text-align: center; margin: 2px 0;">${storeSettings.address || ''}</p><p style="text-align: center; margin: 2px 0 10px 0;">${storeSettings.phone || ''}</p><hr style="border-top: 1px dashed black;"><p><strong>ID:</strong> ${order.id}</p><p><strong>Nama:</strong> ${order.customerName}</p><p><strong>Tanggal:</strong> ${new Date(order.createdAt).toLocaleString('id-ID')}</p><hr style="border-top: 1px dashed black;"><p><strong>Detail:</strong></p><table style="width: 100%; font-size: 10px;">${parsedItems.map(item => { const product = products.find(p => p.id === item.productId); const itemPrice = calculateItemPrice(item); return `<tr><td style="vertical-align: top;">${product ? product.name : 'N/A'}</td><td style="text-align: right; vertical-align: top;">${item.quantity}x</td><td style="text-align: right; vertical-align: top;">Rp ${itemPrice.toLocaleString('id-ID')}</td></tr>`; }).join('')}</table><hr style="border-top: 1px dashed black;"><p><strong>Total:</strong> <span style="float: right;">Rp ${order.totalCost.toLocaleString('id-ID')}</span></p><p><strong>Dibayar:</strong> <span style="float: right;">Rp ${order.paidAmount.toLocaleString('id-ID')}</span></p><p><strong>Status:</strong> <span style="float: right;">${order.paymentStatus}</span></p>${change > 0 ? `<p><strong>Kembali:</strong> <span style="float: right;">Rp ${change.toLocaleString('id-ID')}</span></p>` : ''}${remaining > 0 ? `<p><strong>Sisa:</strong> <span style="float: right;">Rp ${remaining.toLocaleString('id-ID')}</span></p>` : ''}<hr style="border-top: 1px dashed black;"><p style="text-align: center; margin-top: 10px;">${storeSettings.receiptNotes || 'Terima kasih!'}</p></div>`;
        const printWindow = window.open('', '', 'width=300,height=600');
        printWindow.document.write(receiptContent);
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-4">{isEditing ? 'Edit Pesanan' : 'Tambah Pesanan'}</h2>
            {message && <div className="bg-green-100 text-green-700 p-3 rounded-lg mb-4">{message}</div>}
            <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-gray-700">Nama Pemesan</label><input type="text" value={currentOrder.customerName} onChange={(e) => setCurrentOrder({ ...currentOrder, customerName: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg" required /></div>
                <div className="md:col-span-2"><h3 className="text-xl font-semibold mt-4 mb-2">Item Pesanan</h3>{currentOrder.items.map((item, index) => (<div key={index} className="flex flex-wrap items-center space-x-2 mb-2 p-2 bg-gray-50 rounded-lg border"><select value={item.productId} onChange={(e) => handleUpdateOrderItem(index, 'productId', e.target.value)} className="flex-grow p-2 border rounded-lg mb-2 md:mb-0" required><option value="">Pilih Produk</option>{products.length > 0 ? products.map(product => (<option key={product.id} value={product.id}>{product.name} ({product.calculationMethod})</option>)) : (<option value="" disabled>Belum ada produk</option>)}</select>{products.find(p => p.id === item.productId)?.calculationMethod === 'dimensi' ? (<><input type="number" step="0.01" placeholder="Lebar (cm)" value={item.width} onChange={(e) => handleUpdateOrderItem(index, 'width', parseFloat(e.target.value) || 0)} className="w-24 p-2 border rounded-lg mb-2 md:mb-0" required /><input type="number" step="0.01" placeholder="Tinggi (cm)" value={item.height} onChange={(e) => handleUpdateOrderItem(index, 'height', parseFloat(e.target.value) || 0)} className="w-24 p-2 border rounded-lg mb-2 md:mb-0" required /></>) : (<input type="number" placeholder="Jumlah" value={item.quantity} onChange={(e) => handleUpdateOrderItem(index, 'quantity', parseInt(e.target.value, 10) || 1)} className="w-24 p-2 border rounded-lg mb-2 md:mb-0" required />)}<span className="text-sm font-semibold text-gray-700">Rp {calculateItemPrice(item).toLocaleString('id-ID')}</span><button type="button" onClick={() => handleRemoveOrderItem(index)} className="bg-red-500 text-white p-2 rounded-lg hover:bg-red-600">Hapus</button></div>))}<button type="button" onClick={handleAddOrderItem} className="mt-2 w-full bg-green-500 text-white p-2 rounded-lg hover:bg-green-600">Tambah Item</button></div>
                <div className="md:col-span-2 mt-4"><p className="text-xl font-bold text-right">Total Biaya: Rp {currentOrder.totalCost.toLocaleString('id-ID')}</p></div>
                <div className="md:col-span-2"><button type="submit" className="w-full bg-blue-500 text-white font-bold py-2 rounded-lg hover:bg-blue-600">{isEditing ? 'Simpan Perubahan' : 'Simpan Pesanan'}</button></div>
            </form>
            <div className="mt-8"><h2 className="text-2xl font-bold mb-4">Daftar Pesanan</h2><div className="overflow-x-auto"><table className="min-w-full bg-white rounded-lg shadow"><thead><tr className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal"><th className="py-3 px-6 text-left">ID</th><th className="py-3 px-6 text-left">Nama</th><th className="py-3 px-6 text-left">Total</th><th className="py-3 px-6 text-left">Status</th><th className="py-3 px-6 text-left">Aksi</th></tr></thead><tbody className="text-gray-600 text-sm font-light">{orders.map(order => (<tr key={order.id} className="border-b border-gray-200 hover:bg-gray-100"><td className="py-3 px-6 text-left whitespace-nowrap">{order.id}</td><td className="py-3 px-6 text-left whitespace-nowrap">{order.customerName}</td><td className="py-3 px-6 text-left">Rp {order.totalCost.toLocaleString('id-ID')}</td><td className="py-3 px-6 text-left"><span className={`py-1 px-3 text-xs font-bold rounded-full ${order.paymentStatus === 'Belum Lunas' ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}`}>{order.paymentStatus}</span></td><td className="py-3 px-6 text-left"><button onClick={() => handleEditOrder(order)} className="text-blue-500 hover:text-blue-700 mr-2">Edit</button><button onClick={() => handlePrintReceipt(order)} className="text-green-500 hover:text-green-700 mr-2">Cetak</button>{(userRole === 'superviser' || userRole === 'owner') && (<button onClick={() => setModal({ show: true, action: () => handleDeleteOrder(order.id), itemId: order.id })} className="text-red-500 hover:text-red-700">Hapus</button>)}</td></tr>))}</tbody></table></div></div>
            <Modal show={modal.show} title="Konfirmasi Hapus" message="Yakin ingin menghapus pesanan ini?" onConfirm={modal.action} onCancel={() => setModal({ show: false, action: null, itemId: null })} />
        </div>
    );
};

// ... (Sisa komponen: PaymentsPage, ExpensesPage, ReportsPage, AccountManagementPage, ProductManagementPage, StoreManagementPage)
// Sisa komponen tidak saya sertakan di sini untuk keringkasan, tapi logikanya sama persis dengan kode asli Anda.
// Cukup salin-tempel sisa komponen dari kode asli Anda ke bagian bawah file App.js ini.
const PaymentsPage = () => { /* ... Kode dari versi sebelumnya ... */ return <div className="bg-white rounded-xl shadow-lg p-6">Halaman Pembayaran</div>; };
const ExpensesPage = () => { /* ... Kode dari versi sebelumnya ... */ return <div className="bg-white rounded-xl shadow-lg p-6">Halaman Pengeluaran</div>; };
const ReportsPage = () => { /* ... Kode dari versi sebelumnya ... */ return <div className="bg-white rounded-xl shadow-lg p-6">Halaman Laporan</div>; };
const AccountManagementPage = () => { /* ... Kode dari versi sebelumnya ... */ return <div className="bg-white rounded-xl shadow-lg p-6">Halaman Manajemen Akun</div>; };
const ProductManagementPage = () => { /* ... Kode dari versi sebelumnya ... */ return <div className="bg-white rounded-xl shadow-lg p-6">Halaman Manajemen Produk</div>; };
const StoreManagementPage = () => { /* ... Kode dari versi sebelumnya ... */ return <div className="bg-white rounded-xl shadow-lg p-6">Halaman Manajemen Toko</div>; };

