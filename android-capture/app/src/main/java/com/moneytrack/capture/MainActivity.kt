package com.moneytrack.capture

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.net.toUri
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.moneytrack.capture.auth.AuthenticationResult
import com.moneytrack.capture.auth.GoogleSignInController
import com.moneytrack.capture.core.CaptureSetupFlow
import com.moneytrack.capture.core.CaptureSetupStep
import com.moneytrack.capture.notification.NotificationAccess
import com.moneytrack.capture.preferences.AppThemeMode
import com.moneytrack.capture.preferences.CapturePreferences
import com.moneytrack.capture.preferences.DiscoveredNotificationSource

class MainActivity : AppCompatActivity() {
    private lateinit var preferences: CapturePreferences
    private lateinit var signInController: GoogleSignInController
    private lateinit var sessionStep: View
    private lateinit var notificationStep: View
    private lateinit var captureStep: View
    private lateinit var readyStep: View
    private lateinit var stepProgress: TextView
    private lateinit var progressOne: View
    private lateinit var progressTwo: View
    private lateinit var progressThree: View
    private lateinit var sourceList: LinearLayout
    private lateinit var readySourceList: LinearLayout
    private lateinit var captureSwitch: CheckBox
    private lateinit var signInButton: Button
    private lateinit var signOutButton: Button
    private lateinit var themeGroup: RadioGroup
    private var firebaseAuth: FirebaseAuth? = null
    private var rendering = false
    private val authStateListener = FirebaseAuth.AuthStateListener { render() }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        preferences = CapturePreferences.create(this)
        applyThemeMode(preferences.appThemeMode)
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)

        signInController = GoogleSignInController(this)
        firebaseAuth = if (FirebaseApp.getApps(this).isEmpty()) null else FirebaseAuth.getInstance()
        bindViews()
        applyWindowInsets()
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
        sessionStep = findViewById(R.id.session_step)
        notificationStep = findViewById(R.id.notification_step)
        captureStep = findViewById(R.id.capture_step)
        readyStep = findViewById(R.id.ready_step)
        stepProgress = findViewById(R.id.step_progress)
        progressOne = findViewById(R.id.progress_one)
        progressTwo = findViewById(R.id.progress_two)
        progressThree = findViewById(R.id.progress_three)
        sourceList = findViewById(R.id.source_list)
        readySourceList = findViewById(R.id.ready_source_list)
        captureSwitch = findViewById(R.id.capture_switch)
        signInButton = findViewById(R.id.sign_in_button)
        signOutButton = findViewById(R.id.sign_out_button)
        themeGroup = findViewById(R.id.theme_group)
    }

    private fun applyWindowInsets() {
        val scrollView = findViewById<ScrollView>(R.id.content_scroll)
        val originalLeft = scrollView.paddingLeft
        val originalTop = scrollView.paddingTop
        val originalRight = scrollView.paddingRight
        val originalBottom = scrollView.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(scrollView) { view, insets ->
            val systemInsets = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            view.updatePadding(
                left = originalLeft + systemInsets.left,
                top = originalTop + systemInsets.top,
                right = originalRight + systemInsets.right,
                bottom = originalBottom + systemInsets.bottom,
            )
            insets
        }
        ViewCompat.requestApplyInsets(scrollView)
    }

    private fun bindActions() {
        signInButton.setOnClickListener { signInController.signIn(::showAuthenticationResult) }
        signOutButton.setOnClickListener { signInController.signOut(::showAuthenticationResult) }
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
        themeGroup.setOnCheckedChangeListener { _, checkedId ->
            if (rendering) return@setOnCheckedChangeListener
            val selectedMode = when (checkedId) {
                R.id.theme_light -> AppThemeMode.LIGHT
                R.id.theme_dark -> AppThemeMode.DARK
                else -> AppThemeMode.SYSTEM
            }
            if (preferences.appThemeMode != selectedMode) {
                preferences.appThemeMode = selectedMode
                applyThemeMode(selectedMode)
            }
        }
    }

    private fun render() {
        rendering = true
        val signedIn = firebaseAuth?.currentUser != null
        val accessGranted = NotificationAccess.isGranted(this)
        val allowedPackages = preferences.allowedPackages()
        val step = CaptureSetupFlow.resolve(
            signedIn = signedIn,
            notificationAccessGranted = accessGranted,
            captureEnabled = preferences.captureEnabled,
            allowedPackages = allowedPackages,
        )

        renderStep(step)
        captureSwitch.isChecked = preferences.captureEnabled
        signInButton.visibility = if (signedIn) View.GONE else View.VISIBLE
        signOutButton.visibility = if (signedIn) View.VISIBLE else View.GONE
        themeGroup.check(themeIdFor(preferences.appThemeMode))
        renderSources(allowedPackages)
        rendering = false
    }

    private fun renderStep(step: CaptureSetupStep) {
        sessionStep.visibility = if (step == CaptureSetupStep.SESSION) View.VISIBLE else View.GONE
        notificationStep.visibility = if (step == CaptureSetupStep.NOTIFICATION_ACCESS) View.VISIBLE else View.GONE
        captureStep.visibility = if (step == CaptureSetupStep.CAPTURE) View.VISIBLE else View.GONE
        readyStep.visibility = if (step == CaptureSetupStep.READY) View.VISIBLE else View.GONE

        val completedSteps = when (step) {
            CaptureSetupStep.SESSION -> 0
            CaptureSetupStep.NOTIFICATION_ACCESS -> 1
            CaptureSetupStep.CAPTURE -> 2
            CaptureSetupStep.READY -> 3
        }
        val currentStep = when (step) {
            CaptureSetupStep.SESSION -> 1
            CaptureSetupStep.NOTIFICATION_ACCESS -> 2
            CaptureSetupStep.CAPTURE, CaptureSetupStep.READY -> 3
        }
        stepProgress.text = getString(R.string.step_progress, currentStep)
        listOf(progressOne, progressTwo, progressThree).forEachIndexed { index, progress ->
            progress.setBackgroundResource(
                if (index < completedSteps) R.drawable.progress_complete else R.drawable.progress_pending,
            )
        }
    }

    private fun renderSources(allowedPackages: Set<String>) {
        sourceList.removeAllViews()
        readySourceList.removeAllViews()
        val sources = preferences.discoveredSources()
        if (sources.isEmpty()) {
            sourceList.addView(sourceTextView(getString(R.string.source_list_empty)))
            return
        }

        sources.forEach { source ->
            sourceList.addView(
                CheckBox(this).apply {
                    text = displayLabel(source)
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

        sources.filter { it.packageName in allowedPackages }.forEach { source ->
            readySourceList.addView(sourceTextView(displayLabel(source)))
        }
    }

    private fun sourceTextView(label: String) = TextView(this).apply {
        text = label
        minHeight = resources.getDimensionPixelSize(R.dimen.control_min_height)
        gravity = android.view.Gravity.CENTER_VERTICAL
        setTextAppearance(android.R.style.TextAppearance_Material_Body1)
    }

    private fun displayLabel(source: DiscoveredNotificationSource): String =
        source.label.takeIf { it.isNotBlank() && it != source.packageName }
            ?: getString(R.string.source_unnamed)

    private fun themeIdFor(mode: AppThemeMode): Int = when (mode) {
        AppThemeMode.SYSTEM -> R.id.theme_system
        AppThemeMode.LIGHT -> R.id.theme_light
        AppThemeMode.DARK -> R.id.theme_dark
    }

    private fun applyThemeMode(mode: AppThemeMode) {
        val nightMode = when (mode) {
            AppThemeMode.SYSTEM -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            AppThemeMode.LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
            AppThemeMode.DARK -> AppCompatDelegate.MODE_NIGHT_YES
        }
        if (AppCompatDelegate.getDefaultNightMode() != nightMode) {
            AppCompatDelegate.setDefaultNightMode(nightMode)
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
}
