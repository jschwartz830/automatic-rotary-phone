export function SetupRequired() {
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-gray-50 px-6 pt-[env(safe-area-inset-top)] dark:bg-gray-900">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Connect Supabase to finish setup</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This app needs a Supabase project before it can run. <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> weren't set when this build was created.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
          <li>
            Create a project at{' '}
            <a className="text-blue-600 underline dark:text-blue-400" href="https://supabase.com" target="_blank" rel="noreferrer">
              supabase.com
            </a>{' '}
            and run the SQL files in <code>supabase/migrations/</code> (in order) in its SQL editor.
          </li>
          <li>
            Copy the Project URL and anon/public key from Project Settings → API.
          </li>
          <li>
            For local development, put them in a <code>.env</code> file (copy <code>.env.example</code>).
          </li>
          <li>
            For the deployed site, add them as repository secrets named <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> under Settings → Secrets and variables → Actions, then re-run the
            "Deploy to GitHub Pages" workflow (secrets are baked in at build time).
          </li>
        </ol>
      </div>
    </div>
  )
}
