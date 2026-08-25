package com.moneytrack.capture

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.net.toUri
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.moneytrack.capture.auth.AuthenticationResult
import com.moneytrack.capture.auth.GoogleSignInController
import com.moneytrack.capture.core.CaptureEligibility
import com.moneytrack.capture.core.CaptureEligibilityResult
import com.moneytrack.capture.core.CaptureEligibilityState
import com.moneytrack.capture.core.CaptureResultCode
import com.moneytrack.capture.notification.NotificationAccess
import com.moneytrack.capture.preferences.CapturePreferences

class MainActivity : ComponentActivity() {
    private lateinit var preferences: CapturePreferences
    private lateinit var signInController: GoogleSignInController
    private lateinit var sessionStatus: TextView
    private lateinit var accessStatus: TextView
    private lateinit var captureStatus: TextView
    private lateinit var packageStatus: TextView
    private lateinit var resultStatus: TextView
    private lateinit var sourceList: LinearLayout
    private lateinit var captureSwitch: CheckBox
    private lateinit var signInButton: Button
    private lateinit var signOutButton: Button
    private var firebaseAuth: FirebaseAuth? = null
    private var rendering = false
    private val authStateListener = FirebaseAuth.AuthStateListener { render() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        preferences = CapturePreferences.create(this)
        signInController = GoogleSignInController(this)
        firebaseAuth = if (FirebaseApp.getApps(this).isEmpty()) null else FirebaseAuth.getInstance()
        bindViews()
        bindActions()
        firebaseAuth?.addAuthStateListener(authStateListener)
        render()
    }

    override fun onResume() {
        super.onResume()
        if (::preferences.isInitialized) render()
    }

    override fun onDestroy() {
        firebaseAuth?.removeAuthStateListener(authStateListener)
        super.onDestroy()
    }

    private fun bindViews() {
        sessionStatus = findViewById(R.id.session_status)
        accessStatus = findViewById(R.id.access_status)
        captureStatus = findViewById(R.id.capture_status)
        packageStatus = findViewById(R.id.package_status)
        resultStatus = findViewById(R.id.result_status)
        sourceList = findViewById(R.id.source_list)
        captureSwitch = findViewById(R.id.capture_switch)
        signInButton = findViewById(R.id.sign_in_button)
        signOutButton = findViewById(R.id.sign_out_button)
    }

    private fun bindActions() {
        signInButton.setOnClickListener {
            signInController.signIn(::showAuthenticationResult)
        }
        signOutButton.setOnClickListener {
            signInController.signOut(::showAuthenticationResult)
        }
        findViewById<Button>(R.id.notification_settings_button).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        findViewById<Button>(R.id.open_pwa_button).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, getString(R.string.pwa_url).toUri()))
        }
        captureSwitch.setOnCheckedChangeListener { _, isChecked ->
            if (rendering) return@setOnCheckedChangeListener
            preferences.captureEnabled = isChecked
            render()
        }
    }

    private fun render() {
        rendering = true
        val signedIn = firebaseAuth?.currentUser != null
        val accessGranted = NotificationAccess.isGranted(this)
        val allowedPackages = preferences.allowedPackages()
        val state = CaptureEligibilityState(
            signedIn = signedIn,
            captureEnabled = preferences.captureEnabled,
            notificationAccessGranted = accessGranted,
            allowedPackages = allowedPackages,
        )
        val eligibility = CaptureEligibility.evaluate(
            state,
            allowedPackages.firstOrNull().orEmpty(),
        )

        sessionStatus.setText(
            if (signedIn) R.string.status_session_active else R.string.status_session_inactive,
        )
        accessStatus.setText(
            if (accessGranted) R.string.status_access_granted else R.string.status_access_missing,
        )
        captureStatus.setText(
            if (eligibility == CaptureEligibilityResult.READY) {
                R.string.status_capture_active
            } else {
                R.string.status_capture_inactive
            },
        )
        packageStatus.text = if (allowedPackages.isEmpty()) {
            getString(R.string.status_packages_empty)
        } else {
            allowedPackages.sorted().joinToString(separator = "\n")
        }
        resultStatus.text = captureResultLabel(preferences.lastResultCode)
        captureSwitch.isChecked = preferences.captureEnabled
        signInButton.isEnabled = !signedIn
        signOutButton.isEnabled = signedIn
        renderSources(allowedPackages)
        rendering = false
    }

    private fun renderSources(allowedPackages: Set<String>) {
        sourceList.removeAllViews()
        val sources = preferences.discoveredSources()
        if (sources.isEmpty()) {
            sourceList.addView(
                TextView(this).apply {
                    setText(R.string.source_list_empty)
                    setTextAppearance(android.R.style.TextAppearance_Material_Body1)
                },
            )
            return
        }

        sources.forEach { source ->
            sourceList.addView(
                CheckBox(this).apply {
                    text = getString(R.string.source_option, source.label, source.packageName)
                    isChecked = source.packageName in allowedPackages
                    minHeight = resources.getDimensionPixelSize(R.dimen.control_min_height)
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    )
                    setOnCheckedChangeListener { _, selected ->
                        if (rendering) return@setOnCheckedChangeListener
                        val updated = preferences.allowedPackages().toMutableSet()
                        if (selected) updated += source.packageName else updated -= source.packageName
                        preferences.setAllowedPackages(updated)
                        render()
                    }
                },
            )
        }
    }

    private fun showAuthenticationResult(result: AuthenticationResult) {
        val message = when (result) {
            AuthenticationResult.SIGNED_IN -> R.string.auth_signed_in
            AuthenticationResult.SIGNED_OUT -> R.string.auth_signed_out
            AuthenticationResult.CONFIGURATION_MISSING -> R.string.auth_configuration_missing
            AuthenticationResult.FAILED -> R.string.auth_failed
        }
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        render()
    }

    private fun captureResultLabel(code: String?): String {
        val result = code?.let { runCatching { CaptureResultCode.valueOf(it) }.getOrNull() }
            ?: return getString(R.string.last_result_none)
        val resource = when (result) {
            CaptureResultCode.SIGNED_OUT -> R.string.result_signed_out
            CaptureResultCode.CAPTURE_DISABLED -> R.string.result_capture_disabled
            CaptureResultCode.NOTIFICATION_ACCESS_MISSING -> R.string.result_access_missing
            CaptureResultCode.ALLOWLIST_EMPTY -> R.string.result_allowlist_empty
            CaptureResultCode.PACKAGE_NOT_ALLOWED -> R.string.result_package_not_allowed
            CaptureResultCode.NO_PURCHASE_MARKER -> R.string.result_no_purchase_marker
            CaptureResultCode.FORBIDDEN_MARKER -> R.string.result_forbidden_marker
            CaptureResultCode.NO_COP_AMOUNT -> R.string.result_no_cop_amount
            CaptureResultCode.AMBIGUOUS_AMOUNT -> R.string.result_ambiguous_amount
            CaptureResultCode.UNSUPPORTED_CURRENCY -> R.string.result_unsupported_currency
            CaptureResultCode.MALFORMED_AMOUNT -> R.string.result_malformed_amount
            CaptureResultCode.ACCEPTED_HIGH -> R.string.result_accepted_high
            CaptureResultCode.ACCEPTED_MEDIUM -> R.string.result_accepted_medium
            CaptureResultCode.STORED -> R.string.result_stored
            CaptureResultCode.WRITE_FAILED -> R.string.result_write_failed
            CaptureResultCode.INSPECTION_FAILED -> R.string.result_inspection_failed
        }
        return getString(resource)
    }
}
