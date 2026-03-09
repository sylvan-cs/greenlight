import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12">
      <div className="max-w-[640px] mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-primary mb-8">
          <span className="text-lg">&larr;</span>
          <span className="font-display text-lg">The Starter</span>
        </Link>

        <h1 className="font-display text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: February 23, 2026</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-foreground font-semibold text-lg mb-3">1. About The Starter</h2>
            <p>
              The Starter is operated by Sylvan Juarez. The app helps golfers coordinate tee times
              by matching players with compatible schedules and preferences. By using The Starter,
              you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-lg mb-3">2. Eligibility</h2>
            <p>You must be at least 18 years old to use The Starter.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-lg mb-3">3. Your Account</h2>
            <p>
              You are responsible for maintaining the security of your login credentials. You are
              responsible for all activity that occurs under your account. Notify us immediately if
              you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-lg mb-3">4. The Service</h2>
            <p>
              The Starter is provided "as is" without warranties of any kind. We help you find and
              coordinate tee times, but we do not guarantee tee time availability. We are not
              responsible for bookings made on third-party golf course websites or booking platforms.
              Actual tee time availability and pricing are determined by the courses themselves.
            </p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-lg mb-3">5. SMS &amp; Notifications</h2>
            <p>
              By providing your phone number, you consent to receive SMS notifications about tee
              time matches and updates. Message and data rates may apply. You can opt out at any
              time by replying STOP to any message. Message frequency varies based on your activity.
            </p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-lg mb-3">6. Changes to the Service</h2>
            <p>
              We reserve the right to modify, suspend, or discontinue The Starter at any time, with
              or without notice. We may also update these terms from time to time. Continued use of
              the service after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-lg mb-3">7. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, The Starter and its operator shall not be
              liable for any indirect, incidental, or consequential damages arising from your use of
              the service.
            </p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-lg mb-3">8. Contact</h2>
            <p>
              Questions about these terms? Contact us at{' '}
              <a href="mailto:info@starter.golf" className="text-primary hover:underline">
                info@starter.golf
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
