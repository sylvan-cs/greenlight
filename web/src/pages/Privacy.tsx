import { Link } from 'react-router-dom'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-dark-bg text-white px-6 py-12">
      <div className="max-w-[640px] mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-green-primary mb-8">
          <span className="text-lg">←</span>
          <span className="font-display text-lg">The Starter</span>
        </Link>

        <h1 className="font-display text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-text-secondary text-sm mb-10">Last updated: February 23, 2026</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-300">
          <section>
            <h2 className="text-white font-semibold text-lg mb-3">1. What We Collect</h2>
            <p>When you use The Starter, we collect the following information:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Name and email address</li>
              <li>Phone number</li>
              <li>Golf course preferences</li>
              <li>Round history and tee time search activity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">2. How We Use Your Data</h2>
            <p>We use your information to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Match you with compatible tee times and players</li>
              <li>Send notifications about tee time matches via SMS and email</li>
              <li>Improve the service and user experience</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">3. SMS Communications</h2>
            <p>
              By adding your phone number to The Starter, you consent to receive SMS notifications
              about tee time matches and updates. You can opt out at any time by replying STOP to
              any message. Message and data rates may apply. Message frequency varies based on your
              activity.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">4. Third-Party Services</h2>
            <p>We use the following third-party services to operate The Starter:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong className="text-white">Supabase</strong> — database and authentication</li>
              <li><strong className="text-white">Twilio</strong> — SMS notifications</li>
              <li><strong className="text-white">Resend</strong> — email notifications</li>
              <li><strong className="text-white">Vercel</strong> — hosting</li>
            </ul>
            <p className="mt-3">We do not sell your personal data to anyone.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">5. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. If you delete your account,
              we will delete your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">6. Your Rights</h2>
            <p>
              You can request deletion of your account and all associated data at any time by
              contacting us. We will process your request promptly.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">7. Contact</h2>
            <p>
              For privacy-related questions or data deletion requests, contact us at{' '}
              <a href="mailto:info@starter.golf" className="text-green-primary hover:underline">
                info@starter.golf
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
