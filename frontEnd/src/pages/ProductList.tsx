import { useEffect, useState } from 'react';
import { productAPI } from '../api';

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  unit: string;
}

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await productAPI.list();
        setProducts(Array.isArray(res) ? res : []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {products.map((product) => (
        <div key={product.id} className="border rounded p-4 hover:shadow-lg">
          <h3 className="font-bold text-lg">{product.name}</h3>
          <p className="text-gray-600">{product.category}</p>
          <p className="text-2xl font-bold text-green-600">${product.price}</p>
          <p className="text-sm text-gray-500">Unit: {product.unit}</p>
          <button className="mt-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
            Add to cart
          </button>
        </div>
      ))}
    </div>
  );
}
