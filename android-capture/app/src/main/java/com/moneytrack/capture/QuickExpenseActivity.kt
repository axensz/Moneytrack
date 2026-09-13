package com.moneytrack.capture

import android.app.DatePickerDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.net.toUri
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.doOnLayout
import androidx.core.view.isVisible
import androidx.core.view.updatePadding
import androidx.core.widget.doAfterTextChanged
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.moneytrack.capture.auth.AuthenticationResult
import com.moneytrack.capture.auth.GoogleSignInController
import com.moneytrack.capture.preferences.AppThemeMode
import com.moneytrack.capture.preferences.CapturePreferences
import com.moneytrack.capture.quickexpense.QuickExpenseCandidateId
import com.moneytrack.capture.quickexpense.QuickExpenseDraftRepository
import com.moneytrack.capture.quickexpense.QuickExpenseField
import com.moneytrack.capture.quickexpense.QuickExpenseFormInput
import com.moneytrack.capture.quickexpense.QuickExpenseHandoff
import com.moneytrack.capture.quickexpense.QuickExpenseOption
import com.moneytrack.capture.quickexpense.QuickExpenseOptions
import com.moneytrack.capture.quickexpense.QuickExpenseOptionsRepository
import com.moneytrack.capture.quickexpense.QuickExpenseWriteResult
import com.moneytrack.capture.quickexpense.buildQuickExpenseDraft
import com.moneytrack.capture.quickexpense.validateQuickExpenseForm
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

internal enum class QuickExpenseScreenState {
    SIGNED_OUT,
    LOADING_OPTIONS,
    EDITING,
    SAVING,
    STORED,
    ERROR,
}

internal enum class QuickExpensePrimaryAction {
    SIGN_IN,
    WAIT,
    CONTINUE,
    OPEN,
    RETRY,
}

internal fun quickExpensePrimaryAction(
    state: QuickExpenseScreenState,
): QuickExpensePrimaryAction = when (state) {
    QuickExpenseScreenState.SIGNED_OUT -> QuickExpensePrimaryAction.SIGN_IN
    QuickExpenseScreenState.LOADING_OPTIONS,
    QuickExpenseScreenState.SAVING,
    -> QuickExpensePrimaryAction.WAIT
    QuickExpenseScreenState.EDITING -> QuickExpensePrimaryAction.CONTINUE
    QuickExpenseScreenState.STORED -> QuickExpensePrimaryAction.OPEN
    QuickExpenseScreenState.ERROR -> QuickExpensePrimaryAction.RETRY
}

private enum class QuickExpenseErrorKind {
    LOAD,
    SAVE,
    OPEN,
}

class QuickExpenseActivity : AppCompatActivity() {
    private lateinit var preferences: CapturePreferences
    private lateinit var signInController: GoogleSignInController
    private lateinit var contentColumn: View
    private lateinit var form: View
    private lateinit var feedbackPanel: View
    private lateinit var feedbackHeading: TextView
    private lateinit var feedback: TextView
    private lateinit var missingPanel: View
    private lateinit var missingExplanation: TextView
    private lateinit var merchantInput: EditText
    private lateinit var dateButton: Button
    private lateinit var amountInput: EditText
    private lateinit var categorySpinner: Spinner
    private lateinit var accountSpinner: Spinner
    private lateinit var primaryAction: Button
    private lateinit var merchantError: TextView
    private lateinit var dateError: TextView
    private lateinit var amountError: TextView
    private lateinit var categoryError: TextView
    private lateinit var accountError: TextView

    private var firebaseAuth: FirebaseAuth? = null
    private var screenState = QuickExpenseScreenState.LOADING_OPTIONS
    private var errorKind = QuickExpenseErrorKind.LOAD
    private var selectedDate: LocalDate = LocalDate.now()
    private var options = QuickExpenseOptions(emptyList(), emptyList())
    private var candidateId: String? = null
    private var loadingUid: String? = null
    private var loadedUid: String? = null
    private var preferredAccountId: String? = null
    private var preferredAccountName: String? = null
    private var preferredCategory: String? = null
    private var restoredScreenState: QuickExpenseScreenState? = null
    private var restoredErrorKind: QuickExpenseErrorKind? = null
    private var feedbackOverride: String? = null
    private var populatingSpinners = false

    private val candidateIdGenerator = QuickExpenseCandidateId()
    private val dateFormatter = DateTimeFormatter.ofPattern(
        "d 'de' MMMM 'de' uuuu",
        Locale.forLanguageTag("es-CO"),
    )
    private val authStateListener = FirebaseAuth.AuthStateListener { resolveSession() }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        preferences = CapturePreferences.create(this)
        applyThemeMode(preferences.appThemeMode)
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_quick_expense)

        signInController = GoogleSignInController(this)
        firebaseAuth = if (FirebaseApp.getApps(this).isEmpty()) null else FirebaseAuth.getInstance()
        bindViews()
        restoreForm(savedInstanceState)
        bindActions()
        applyWindowInsets()
        renderDate()
        populateSpinners()
        resolveSession()
    }

    override fun onStart() {
        super.onStart()
        firebaseAuth?.addAuthStateListener(authStateListener)
    }

    override fun onStop() {
        firebaseAuth?.removeAuthStateListener(authStateListener)
        super.onStop()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString(KEY_MERCHANT, merchantInput.text.toString())
        outState.putString(KEY_DATE, selectedDate.toString())
        outState.putString(KEY_AMOUNT, amountInput.text.toString())
        outState.putString(KEY_ACCOUNT_ID, selectedAccount()?.id ?: preferredAccountId)
        outState.putString(KEY_ACCOUNT_NAME, selectedAccount()?.name ?: preferredAccountName)
        outState.putString(KEY_CATEGORY, selectedCategory()?.name ?: preferredCategory)
        outState.putString(KEY_CANDIDATE_ID, candidateId)
        outState.putString(KEY_SCREEN_STATE, screenState.name)
        outState.putString(KEY_ERROR_KIND, errorKind.name)
        outState.putString(KEY_FEEDBACK, feedbackOverride)
        fieldErrors().forEach { (field, view) ->
            if (view.isVisible) {
                outState.putString(errorKey(field), view.text.toString())
            }
        }
        super.onSaveInstanceState(outState)
    }

    private fun bindViews() {
        contentColumn = findViewById(R.id.quick_expense_content)
        form = findViewById(R.id.quick_expense_form)
        feedbackPanel = findViewById(R.id.quick_expense_feedback_panel)
        feedbackHeading = findViewById(R.id.quick_expense_feedback_heading)
        feedback = findViewById(R.id.quick_expense_feedback)
        missingPanel = findViewById(R.id.quick_expense_missing_panel)
        missingExplanation = findViewById(R.id.quick_expense_missing_explanation)
        merchantInput = findViewById(R.id.quick_expense_merchant)
        dateButton = findViewById(R.id.quick_expense_date)
        amountInput = findViewById(R.id.quick_expense_amount)
        categorySpinner = findViewById(R.id.quick_expense_category)
        accountSpinner = findViewById(R.id.quick_expense_account)
        primaryAction = findViewById(R.id.quick_expense_primary_action)
        merchantError = findViewById(R.id.quick_expense_merchant_error)
        dateError = findViewById(R.id.quick_expense_date_error)
        amountError = findViewById(R.id.quick_expense_amount_error)
        categoryError = findViewById(R.id.quick_expense_category_error)
        accountError = findViewById(R.id.quick_expense_account_error)
    }

    private fun restoreForm(savedState: Bundle?) {
        if (savedState == null) return
        merchantInput.setText(savedState.getString(KEY_MERCHANT).orEmpty())
        amountInput.setText(savedState.getString(KEY_AMOUNT).orEmpty())
        selectedDate = savedState.getString(KEY_DATE)
            ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            ?: LocalDate.now()
        preferredAccountId = savedState.getString(KEY_ACCOUNT_ID)
        preferredAccountName = savedState.getString(KEY_ACCOUNT_NAME)
        preferredCategory = savedState.getString(KEY_CATEGORY)
        candidateId = savedState.getString(KEY_CANDIDATE_ID)
        restoredScreenState = savedState.enumValueOrNull<QuickExpenseScreenState>(KEY_SCREEN_STATE)
        restoredErrorKind = savedState.enumValueOrNull<QuickExpenseErrorKind>(KEY_ERROR_KIND)
        feedbackOverride = savedState.getString(KEY_FEEDBACK)
        fieldErrors().forEach { (field, view) ->
            savedState.getString(errorKey(field))?.let { message ->
                view.text = message
                view.visibility = View.VISIBLE
            }
        }
    }

    private fun bindActions() {
        merchantInput.doAfterTextChanged { clearFieldError(QuickExpenseField.MERCHANT) }
        amountInput.doAfterTextChanged { clearFieldError(QuickExpenseField.AMOUNT) }
        dateButton.setOnClickListener { showDatePicker() }
        categorySpinner.onItemSelectedListener = selectionListener(QuickExpenseField.CATEGORY)
        accountSpinner.onItemSelectedListener = selectionListener(QuickExpenseField.ACCOUNT)
        primaryAction.setOnClickListener { performPrimaryAction() }
        findViewById<Button>(R.id.quick_expense_open_setup).setOnClickListener {
            openCanonicalMoneyTrack()
        }
    }

    private fun selectionListener(field: QuickExpenseField) =
        object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(
                parent: AdapterView<*>?,
                view: View?,
                position: Int,
                id: Long,
            ) {
                if (!populatingSpinners) clearFieldError(field)
            }

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

    private fun resolveSession() {
        if (isFinishing || isDestroyed) return
        val restored = restoredScreenState
        val restoredOpenState = candidateId != null && (
            restored == QuickExpenseScreenState.STORED ||
                (restored == QuickExpenseScreenState.ERROR && restoredErrorKind == QuickExpenseErrorKind.OPEN)
            )
        if (restoredOpenState) {
            seedRestoredOptions()
            screenState = requireNotNull(restored)
            errorKind = restoredErrorKind ?: QuickExpenseErrorKind.OPEN
            restoredScreenState = null
            render()
            return
        }

        val user = firebaseAuth?.currentUser
        if (user == null) {
            loadingUid = null
            loadedUid = null
            screenState = QuickExpenseScreenState.SIGNED_OUT
            render()
            return
        }
        if (loadingUid == user.uid) return
        if (loadedUid == user.uid) {
            screenState = QuickExpenseScreenState.EDITING
            render()
            return
        }
        loadOptions(user.uid)
    }

    private fun loadOptions(uid: String) {
        loadingUid = uid
        screenState = QuickExpenseScreenState.LOADING_OPTIONS
        errorKind = QuickExpenseErrorKind.LOAD
        render()
        val accountBeforeLoad = selectedAccount()?.id ?: preferredAccountId
        val categoryBeforeLoad = selectedCategory()?.name ?: preferredCategory
        QuickExpenseOptionsRepository(uid).load { result ->
            runOnUiThread {
                if (isFinishing || isDestroyed || firebaseAuth?.currentUser?.uid != uid) {
                    return@runOnUiThread
                }
                loadingUid = null
                result.fold(
                    onSuccess = { loaded ->
                        options = withDefaultExpenseCategories(loaded)
                        loadedUid = uid
                        preferredAccountId = accountBeforeLoad
                        preferredCategory = categoryBeforeLoad
                        populateSpinners()
                        val shouldRestoreSaveError =
                            restoredScreenState == QuickExpenseScreenState.ERROR &&
                                restoredErrorKind == QuickExpenseErrorKind.SAVE
                        screenState = if (shouldRestoreSaveError) {
                            QuickExpenseScreenState.ERROR
                        } else {
                            QuickExpenseScreenState.EDITING
                        }
                        errorKind = restoredErrorKind ?: QuickExpenseErrorKind.LOAD
                        restoredScreenState = null
                        restoredErrorKind = null
                        if (!shouldRestoreSaveError) feedbackOverride = null
                        render()
                    },
                    onFailure = {
                        screenState = QuickExpenseScreenState.ERROR
                        errorKind = QuickExpenseErrorKind.LOAD
                        feedbackOverride = getString(R.string.quick_expense_load_error)
                        render()
                    },
                )
            }
        }
    }

    private fun populateSpinners() {
        populatingSpinners = true
        val accountLabels = listOf(getString(R.string.quick_expense_account_prompt)) +
            options.accounts.map(QuickExpenseOption::name)
        accountSpinner.adapter = spinnerAdapter(accountLabels)
        val accountId = preferredAccountId
            ?: options.accounts.singleOrNull(QuickExpenseOption::isDefault)?.id
        accountSpinner.setSelection(
            options.accounts.indexOfFirst { it.id == accountId }
                .takeIf { it >= 0 }
                ?.plus(1)
                ?: 0,
        )

        val categoryLabels = listOf(getString(R.string.quick_expense_category_prompt)) +
            options.categories.map(QuickExpenseOption::name)
        categorySpinner.adapter = spinnerAdapter(categoryLabels)
        categorySpinner.setSelection(
            options.categories.indexOfFirst { it.name == preferredCategory }
                .takeIf { it >= 0 }
                ?.plus(1)
                ?: 0,
        )
        populatingSpinners = false
    }

    private fun seedRestoredOptions() {
        if (options.accounts.isEmpty() && preferredAccountId != null && preferredAccountName != null) {
            options = options.copy(
                accounts = listOf(
                    QuickExpenseOption(requireNotNull(preferredAccountId), requireNotNull(preferredAccountName)),
                ),
            )
        }
        if (options.categories.isEmpty() && preferredCategory != null) {
            val category = requireNotNull(preferredCategory)
            options = options.copy(categories = listOf(QuickExpenseOption(category, category)))
        }
        populateSpinners()
    }

    private fun withDefaultExpenseCategories(
        loaded: QuickExpenseOptions,
    ): QuickExpenseOptions {
        val defaultNames = resources.getStringArray(R.array.default_expense_categories).toList()
        val canonical = defaultNames.mapIndexed { index, name ->
            QuickExpenseOption("default-$index", name)
        }
        return loaded.copy(
            categories = canonical + loaded.categories.filter { it.name !in defaultNames },
        )
    }

    private fun spinnerAdapter(labels: List<String>) =
        ArrayAdapter(this, android.R.layout.simple_spinner_item, labels).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

    private fun performPrimaryAction() {
        when (quickExpensePrimaryAction(screenState)) {
            QuickExpensePrimaryAction.SIGN_IN -> beginSignIn()
            QuickExpensePrimaryAction.WAIT -> Unit
            QuickExpensePrimaryAction.CONTINUE -> saveDraft()
            QuickExpensePrimaryAction.OPEN -> openStoredCandidate()
            QuickExpensePrimaryAction.RETRY -> when (errorKind) {
                QuickExpenseErrorKind.LOAD -> firebaseAuth?.currentUser?.uid?.let(::loadOptions)
                    ?: beginSignIn()
                QuickExpenseErrorKind.SAVE -> saveDraft()
                QuickExpenseErrorKind.OPEN -> openStoredCandidate()
            }
        }
    }

    private fun beginSignIn() {
        primaryAction.isEnabled = false
        signInController.signIn { result ->
            if (result == AuthenticationResult.SIGNED_IN) {
                feedbackOverride = null
                resolveSession()
            } else {
                screenState = QuickExpenseScreenState.SIGNED_OUT
                feedbackOverride = getString(R.string.auth_failed_actionable)
                render()
            }
        }
    }

    private fun saveDraft() {
        if (screenState == QuickExpenseScreenState.SAVING) return
        val user = firebaseAuth?.currentUser
        if (user == null) {
            screenState = QuickExpenseScreenState.SIGNED_OUT
            render()
            return
        }
        val input = currentInput()
        val issue = validateQuickExpenseForm(input)
        if (issue != null) {
            showFieldError(issue.field, issue.message)
            return
        }
        val id = candidateId ?: candidateIdGenerator.generate().also { candidateId = it }
        val draft = buildQuickExpenseDraft(input, id)
        screenState = QuickExpenseScreenState.SAVING
        feedbackOverride = null
        render()
        QuickExpenseDraftRepository(user.uid).save(draft) { result ->
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                when (result) {
                    QuickExpenseWriteResult.STORED -> {
                        screenState = QuickExpenseScreenState.STORED
                        render()
                        openStoredCandidate()
                    }
                    QuickExpenseWriteResult.COLLISION -> {
                        candidateId = null
                        screenState = QuickExpenseScreenState.ERROR
                        errorKind = QuickExpenseErrorKind.SAVE
                        feedbackOverride = getString(R.string.quick_expense_collision_error)
                        render()
                    }
                    QuickExpenseWriteResult.WRITE_FAILED -> {
                        screenState = QuickExpenseScreenState.ERROR
                        errorKind = QuickExpenseErrorKind.SAVE
                        feedbackOverride = getString(R.string.quick_expense_save_error)
                        render()
                    }
                }
            }
        }
    }

    private fun currentInput() = QuickExpenseFormInput(
        merchant = merchantInput.text.toString(),
        date = selectedDate,
        amount = amountInput.text.toString(),
        category = selectedCategory()?.name.orEmpty(),
        accountId = selectedAccount()?.id.orEmpty(),
    )

    private fun selectedAccount(): QuickExpenseOption? =
        options.accounts.getOrNull(accountSpinner.selectedItemPosition - 1)

    private fun selectedCategory(): QuickExpenseOption? =
        options.categories.getOrNull(categorySpinner.selectedItemPosition - 1)

    private fun showDatePicker() {
        DatePickerDialog(
            this,
            { _, year, month, day ->
                selectedDate = LocalDate.of(year, month + 1, day)
                renderDate()
                clearFieldError(QuickExpenseField.DATE)
            },
            selectedDate.year,
            selectedDate.monthValue - 1,
            selectedDate.dayOfMonth,
        ).show()
    }

    private fun renderDate() {
        val label = selectedDate.format(dateFormatter)
        dateButton.text = label.replaceFirstChar { character ->
            if (character.isLowerCase()) character.titlecase(Locale.forLanguageTag("es-CO")) else character.toString()
        }
        dateButton.contentDescription = getString(
            R.string.quick_expense_date_selected_description,
            label,
        )
    }

    private fun showFieldError(field: QuickExpenseField, message: String) {
        clearAllFieldErrors()
        val view = fieldErrors().getValue(field)
        view.text = message
        view.visibility = View.VISIBLE
        when (field) {
            QuickExpenseField.MERCHANT -> merchantInput
            QuickExpenseField.DATE -> dateButton
            QuickExpenseField.AMOUNT -> amountInput
            QuickExpenseField.CATEGORY -> categorySpinner
            QuickExpenseField.ACCOUNT -> accountSpinner
        }.requestFocus()
    }

    private fun clearFieldError(field: QuickExpenseField) {
        val error = fieldErrors().getValue(field)
        error.text = ""
        error.visibility = View.GONE
        if (screenState == QuickExpenseScreenState.ERROR && errorKind == QuickExpenseErrorKind.SAVE) {
            candidateId = null
        }
    }

    private fun clearAllFieldErrors() {
        fieldErrors().values.forEach { view ->
            view.text = ""
            view.visibility = View.GONE
        }
    }

    private fun fieldErrors(): Map<QuickExpenseField, TextView> = mapOf(
        QuickExpenseField.MERCHANT to merchantError,
        QuickExpenseField.DATE to dateError,
        QuickExpenseField.AMOUNT to amountError,
        QuickExpenseField.CATEGORY to categoryError,
        QuickExpenseField.ACCOUNT to accountError,
    )

    private fun render() {
        val action = quickExpensePrimaryAction(screenState)
        primaryAction.setText(
            when (action) {
                QuickExpensePrimaryAction.SIGN_IN -> R.string.sign_in_action
                QuickExpensePrimaryAction.WAIT -> if (screenState == QuickExpenseScreenState.SAVING) {
                    R.string.quick_expense_saving_action
                } else {
                    R.string.quick_expense_loading_action
                }
                QuickExpensePrimaryAction.CONTINUE -> R.string.quick_expense_continue_action
                QuickExpensePrimaryAction.OPEN -> R.string.quick_expense_open_action
                QuickExpensePrimaryAction.RETRY -> R.string.quick_expense_retry_action
            },
        )
        primaryAction.isEnabled = when (action) {
            QuickExpensePrimaryAction.WAIT -> false
            QuickExpensePrimaryAction.CONTINUE ->
                options.accounts.isNotEmpty() && options.categories.isNotEmpty()
            else -> true
        }

        when {
            screenState == QuickExpenseScreenState.STORED ||
                (screenState == QuickExpenseScreenState.ERROR && errorKind == QuickExpenseErrorKind.OPEN) -> {
                setFormEnabled(false)
            }
            screenState == QuickExpenseScreenState.EDITING ||
                (screenState == QuickExpenseScreenState.ERROR && errorKind == QuickExpenseErrorKind.SAVE) -> {
                setFormEnabled(true)
            }
            else -> setFormEnabled(false)
        }
        renderFeedback()
        renderMissingOptions()
    }

    private fun setFormEnabled(enabled: Boolean) {
        listOf(merchantInput, dateButton, amountInput, categorySpinner, accountSpinner)
            .forEach { it.isEnabled = enabled }
        form.alpha = if (enabled) 1f else 0.72f
    }

    private fun renderFeedback() {
        val presentation = when (screenState) {
            QuickExpenseScreenState.SIGNED_OUT -> FeedbackPresentation(
                R.string.quick_expense_sign_in_heading,
                feedbackOverride ?: getString(R.string.quick_expense_sign_in_explanation),
                R.drawable.status_panel,
            )
            QuickExpenseScreenState.LOADING_OPTIONS -> FeedbackPresentation(
                R.string.quick_expense_loading_heading,
                getString(R.string.quick_expense_loading_explanation),
                R.drawable.status_panel,
            )
            QuickExpenseScreenState.STORED -> FeedbackPresentation(
                R.string.quick_expense_stored_heading,
                getString(R.string.quick_expense_stored_explanation),
                R.drawable.status_success_panel,
            )
            QuickExpenseScreenState.ERROR -> FeedbackPresentation(
                R.string.quick_expense_error_heading,
                feedbackOverride ?: getString(R.string.quick_expense_load_error),
                R.drawable.status_error_panel,
            )
            QuickExpenseScreenState.EDITING,
            QuickExpenseScreenState.SAVING,
            -> null
        }
        feedbackPanel.visibility = if (presentation == null) View.GONE else View.VISIBLE
        presentation?.let {
            feedbackHeading.setText(it.heading)
            feedback.text = it.message
            feedbackPanel.setBackgroundResource(it.background)
        }
    }

    private fun renderMissingOptions() {
        val canShow = screenState == QuickExpenseScreenState.EDITING ||
            (screenState == QuickExpenseScreenState.ERROR && errorKind == QuickExpenseErrorKind.SAVE)
        val missingAccounts = options.accounts.isEmpty()
        val missingCategories = options.categories.isEmpty()
        missingPanel.visibility = if (canShow && (missingAccounts || missingCategories)) {
            View.VISIBLE
        } else {
            View.GONE
        }
        if (missingPanel.isVisible) {
            missingExplanation.setText(
                when {
                    missingAccounts && missingCategories -> R.string.quick_expense_missing_both
                    missingAccounts -> R.string.quick_expense_missing_accounts
                    else -> R.string.quick_expense_missing_categories
                },
            )
        }
    }

    private fun openStoredCandidate() {
        val candidateId = candidateId ?: return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, QuickExpenseHandoff.url(candidateId).toUri()))
            finish()
        } catch (_: ActivityNotFoundException) {
            showOpenError()
        } catch (_: SecurityException) {
            showOpenError()
        }
    }

    private fun showOpenError() {
        screenState = QuickExpenseScreenState.ERROR
        errorKind = QuickExpenseErrorKind.OPEN
        feedbackOverride = getString(R.string.quick_expense_open_error)
        render()
    }

    private fun openCanonicalMoneyTrack() {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, getString(R.string.pwa_url).toUri()))
        } catch (_: ActivityNotFoundException) {
            feedbackOverride = getString(R.string.quick_expense_open_error)
            screenState = QuickExpenseScreenState.ERROR
            errorKind = QuickExpenseErrorKind.LOAD
            render()
        }
    }

    private fun applyWindowInsets() {
        val scrollView = findViewById<ScrollView>(R.id.quick_expense_scroll)
        val originalLeft = scrollView.paddingLeft
        val originalTop = scrollView.paddingTop
        val originalRight = scrollView.paddingRight
        val originalBottom = scrollView.paddingBottom
        scrollView.doOnLayout { updateContentWidth(scrollView) }
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
            updateContentWidth(scrollView)
            insets
        }
        ViewCompat.requestApplyInsets(scrollView)
    }

    private fun updateContentWidth(scrollView: ScrollView) {
        val availableWidth = scrollView.width - scrollView.paddingLeft - scrollView.paddingRight
        val targetWidth = minOf(
            availableWidth.coerceAtLeast(0),
            resources.getDimensionPixelSize(R.dimen.content_max_width),
        )
        if (targetWidth > 0 && contentColumn.layoutParams.width != targetWidth) {
            contentColumn.layoutParams = contentColumn.layoutParams.apply { width = targetWidth }
        }
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

    private data class FeedbackPresentation(
        val heading: Int,
        val message: String,
        val background: Int,
    )

    private inline fun <reified T : Enum<T>> Bundle.enumValueOrNull(key: String): T? =
        getString(key)?.let { value -> runCatching { enumValueOf<T>(value) }.getOrNull() }

    private fun errorKey(field: QuickExpenseField): String = "quick_expense_error_${field.name}"

    private companion object {
        const val KEY_MERCHANT = "quick_expense_merchant"
        const val KEY_DATE = "quick_expense_date"
        const val KEY_AMOUNT = "quick_expense_amount"
        const val KEY_ACCOUNT_ID = "quick_expense_account_id"
        const val KEY_ACCOUNT_NAME = "quick_expense_account_name"
        const val KEY_CATEGORY = "quick_expense_category"
        const val KEY_CANDIDATE_ID = "quick_expense_candidate_id"
        const val KEY_SCREEN_STATE = "quick_expense_screen_state"
        const val KEY_ERROR_KIND = "quick_expense_error_kind"
        const val KEY_FEEDBACK = "quick_expense_feedback"
    }
}
