import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="mb-8 border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold text-gray-900">Sail Content Management System</h1>
        <p className="text-gray-600 mt-2">Secure Admin Portal v0.1</p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Events</h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">Database</span>
          </div>
          <p className="text-gray-500 mb-6">Manage historical events, timelines, and importance rankings.</p>
          <div className="space-y-2">
            <Link href="/areas" className="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition-colors">
              Manage Areas
            </Link>
            <Link href="/extractor" className="block w-full text-center bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700 transition-colors">
              Event Extractor
            </Link>
            <button className="w-full bg-white text-blue-600 border border-blue-600 px-4 py-2 rounded font-medium hover:bg-blue-50 transition-colors">
              Manage Events
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Entities</h2>
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">Registry</span>
          </div>
          <p className="text-gray-500 mb-6">Manage historical figures, places, and semantic entities.</p>
          <button className="w-full bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition-colors">
            Manage Entities
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Support</h2>
            <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-0.5 rounded">User Feedback</span>
          </div>
          <p className="text-gray-500 mb-6">Review user suggestions, bug reports, and general feedback.</p>
          <Link href="/feedback" className="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition-colors">
            Feedback Dashboard
          </Link>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">System</h2>
            <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded">Admin</span>
          </div>
          <p className="text-gray-500 mb-6">System settings, user management, and audit logs.</p>
          <button className="w-full bg-gray-800 text-white px-4 py-2 rounded font-medium hover:bg-gray-900 transition-colors">
            Settings
          </button>
        </div>
      </main>
    </div>
  );
}
