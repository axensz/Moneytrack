package com.moneytrack.capture

import android.view.ViewGroup
import org.junit.Assert.assertEquals
import org.junit.Test

class SourceDialogListSizingTest {
    @Test
    fun `wraps the list through two sources and caps it from three`() {
        val maximumHeight = 192

        assertEquals(ViewGroup.LayoutParams.WRAP_CONTENT, sourceDialogListHeight(0, maximumHeight))
        assertEquals(ViewGroup.LayoutParams.WRAP_CONTENT, sourceDialogListHeight(2, maximumHeight))
        assertEquals(maximumHeight, sourceDialogListHeight(3, maximumHeight))
    }
}
