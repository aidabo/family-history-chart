import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect to the charts page by default
  redirect('/charts');
}