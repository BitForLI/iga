import { useState, type FormEvent } from 'react';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';

export function Register() {
  const [formData, setFormData] = useState({
    Name: '',
    Email: '',
    PhoneNumber: '',
    Password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
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
      const data = res as unknown as { userId: number };
      // 后端 api/auth/register 已写入数据库（Users 表）
      setUser({ id: data.userId, name: formData.Name, email: formData.Email, phoneNumber: formData.PhoneNumber });
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
      
      <div className="relative w-full">
        <input
          type={showPassword ? 'text' : 'password'}
          name="Password"
          placeholder="Password"
          value={formData.Password}
          onChange={handleChange}
          required
          className="w-full p-2 pr-10 border rounded box-border"
          autoComplete="new-password"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={showPassword ? '隐藏密码' : '显示密码'}
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-800 border-0 bg-transparent cursor-pointer"
        >
          {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        </button>
      </div>
      
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
