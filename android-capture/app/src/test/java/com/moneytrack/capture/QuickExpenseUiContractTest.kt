package com.moneytrack.capture

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class QuickExpenseUiContractTest {
    @Test
    fun `screen states expose one coherent primary action`() {
        assertEquals(QuickExpensePrimaryAction.SIGN_IN, quickExpensePrimaryAction(QuickExpenseScreenState.SIGNED_OUT))
        assertEquals(QuickExpensePrimaryAction.WAIT, quickExpensePrimaryAction(QuickExpenseScreenState.LOADING_OPTIONS))
        assertEquals(QuickExpensePrimaryAction.CONTINUE, quickExpensePrimaryAction(QuickExpenseScreenState.EDITING))
        assertEquals(QuickExpensePrimaryAction.WAIT, quickExpensePrimaryAction(QuickExpenseScreenState.SAVING))
        assertEquals(QuickExpensePrimaryAction.OPEN, quickExpensePrimaryAction(QuickExpenseScreenState.STORED))
        assertEquals(QuickExpensePrimaryAction.RETRY, quickExpensePrimaryAction(QuickExpenseScreenState.ERROR))
    }

    @Test
    fun `five fields are labeled ordered and usable with touch and keyboard`() {
        val document = parse(resourceFile("layout/activity_quick_expense.xml"))
        val elements = document.getElementsByTagName("*")
        val all = (0 until elements.length).mapNotNull { elements.item(it) as? Element }
        val ids = all.map { it.getAttribute("android:id") }
        val expectedControls = listOf(
            "@+id/quick_expense_merchant",
            "@+id/quick_expense_date",
            "@+id/quick_expense_amount",
            "@+id/quick_expense_category",
            "@+id/quick_expense_account",
        )

        assertTrue(all.first().tagName.endsWith("ScrollView"))
        assertTrue(expectedControls.zipWithNext().all { (left, right) -> ids.indexOf(left) < ids.indexOf(right) })
        expectedControls.forEach { controlId ->
            assertTrue("Missing label for $controlId", all.any { it.getAttribute("android:labelFor") == controlId.removePrefix("@+id/").let { "@id/$it" } })
        }
        val amount = all.single { it.getAttribute("android:id") == "@+id/quick_expense_amount" }
        assertEquals("numberDecimal", amount.getAttribute("android:inputType"))
        val primary = all.single { it.getAttribute("android:id") == "@+id/quick_expense_primary_action" }
        assertEquals("@style/Widget.MoneyTrack.Button.Primary", primary.getAttribute("style"))
        assertEquals("@dimen/control_min_height", primary.getAttribute("android:minHeight"))
    }

    @Test
    fun `feedback is polite visible in the accessibility tree and does not rely on color`() {
        val layout = resourceFile("layout/activity_quick_expense.xml").readText()
        assertTrue(layout.contains("@+id/quick_expense_feedback"))
        assertTrue(layout.contains("android:accessibilityLiveRegion=\"polite\""))
        assertTrue(layout.contains("@drawable/status_error_panel"))
        assertTrue(layout.contains("@string/quick_expense_error_heading"))
    }

    @Test
    fun `activity retains the capture and opens only the opaque handoff after server storage`() {
        val activity = source("java/com/moneytrack/capture/QuickExpenseActivity.kt")

        assertTrue(activity.contains("override fun onSaveInstanceState"))
        assertTrue(activity.contains("buildQuickExpenseDraft("))
        assertTrue(activity.contains("QuickExpenseHandoff.url(candidateId)"))
        assertTrue(activity.contains("QuickExpenseWriteResult.STORED"))
        assertTrue(activity.contains("ActivityNotFoundException"))
        assertTrue(activity.contains("startActivity(Intent(Intent.ACTION_VIEW"))
        assertTrue(activity.contains("finish()"))
        assertFalse(activity.contains("putExtra("))
        assertFalse(activity.contains("NotificationAccess"))
    }

    @Test
    fun `activity clears field errors after correction and blocks duplicate saves`() {
        val activity = source("java/com/moneytrack/capture/QuickExpenseActivity.kt")

        assertTrue(activity.contains("clearFieldError(QuickExpenseField.MERCHANT)"))
        assertTrue(activity.contains("clearFieldError(QuickExpenseField.AMOUNT)"))
        assertTrue(activity.contains("if (screenState == QuickExpenseScreenState.SAVING) return"))
        assertTrue(activity.contains("setFormEnabled(false)"))
    }

    @Test
    fun `native form includes the same canonical expense categories as the current app`() {
        val expected = listOf(
            "Alimentación",
            "Transporte",
            "Servicios",
            "Vivienda",
            "Salud",
            "Entretenimiento",
            "Educación",
            "Compras Personales",
            "Regalos",
            "Otros",
        )
        val arrays = parse(resourceFile("values/arrays.xml"))
        val items = arrays.getElementsByTagName("string-array").item(0).childNodes
        val androidCategories = (0 until items.length)
            .mapNotNull { items.item(it) as? Element }
            .filter { it.tagName == "item" }
            .map { it.textContent }
        val webConstants = projectFile("src/config/constants.ts").readText()

        assertEquals(expected, androidCategories)
        expected.forEach { category -> assertTrue(webConstants.contains("'$category'")) }
        assertTrue(source("java/com/moneytrack/capture/QuickExpenseActivity.kt").contains("R.array.default_expense_categories"))
    }

    private fun parse(file: File) = DocumentBuilderFactory.newInstance()
        .newDocumentBuilder()
        .parse(file)

    private fun source(relative: String): String {
        val candidates = listOf(
            File("android-capture/app/src/main/$relative"),
            File("app/src/main/$relative"),
            File("src/main/$relative"),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("Missing Android source $relative")
    }

    private fun resourceFile(relative: String): File {
        val candidates = listOf(
            File("android-capture/app/src/main/res/$relative"),
            File("app/src/main/res/$relative"),
            File("src/main/res/$relative"),
        )
        return candidates.firstOrNull(File::isFile)
            ?: error("Missing Android resource $relative")
    }

    private fun projectFile(relative: String): File {
        val candidates = listOf(
            File(relative),
            File("../$relative"),
            File("../../$relative"),
        )
        return candidates.firstOrNull(File::isFile)
            ?: error("Missing project file $relative")
    }
}
