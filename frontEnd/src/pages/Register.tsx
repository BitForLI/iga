import { useState, type FormEvent } from 'react';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';

export function Register() {
  const [formData, setFormData] = useState({
    Name: '',
    Email: '',
    PhoneNumber: '',
    Password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authAPI.register(formData);
      const data = res as any;
      setUser({ id: data.userId, name: formData.Name, email: formData.Email, phoneNumber: formData.PhoneNumber });
      // 重定向或显示成功
      console.log('注册成功', res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto p-4">
      <h2 className="text-2xl font-bold">Register</h2>
      {error && <p className="text-red-500">{error}</p>}
      
      <input
        type="text"
        name="Name"
        placeholder="Name"
        value={formData.Name}
        onChange={handleChange}
        required
        className="w-full p-2 border rounded"
      />
      
      <input
        type="email"
        name="Email"
        placeholder="Email"
        value={formData.Email}
        onChange={handleChange}
        required
        className="w-full p-2 border rounded"
      />
      
      <input
        type="tel"
        name="PhoneNumber"
        placeholder="Phone"
        value={formData.PhoneNumber}
        onChange={handleChange}
        required
        className="w-full p-2 border rounded"
      />
      
      <input
        type="password"
        name="Password"
        placeholder="Password"
        value={formData.Password}
        onChange={handleChange}
        required
        className="w-full p-2 border rounded"
      />
      
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Registering...' : 'Register'}
      </button>
    </form>
  );
}
