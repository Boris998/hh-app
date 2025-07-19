'use client';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useAuthStore } from '../../stores/auth';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const { register, error, clearError } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    try {
      await register(
        formData.get('email') as string,
        formData.get('password') as string,
        formData.get('name') as string || undefined
      );
      router.push('/dashboard');
    } catch (error:unknown) {
      alert((error as Error).message);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10">
      <h1 className="text-2xl font-bold mb-4">Register</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input name="email" type="email" placeholder="Email" required />
        <Input name="password" type="password" placeholder="Password" required />
        <Input name="name" type="text" />
        <Button type="submit">Register</Button>
      </form>
    </div>
  );
}