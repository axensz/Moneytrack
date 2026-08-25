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

    @Test
    fun `content stays fluid on compact widths and capped on expanded widths`() {
        assertEquals(280, contentColumnWidth(availableWidth = 280, maximumWidth = 600))
        assertEquals(400, contentColumnWidth(availableWidth = 400, maximumWidth = 600))
        assertEquals(600, contentColumnWidth(availableWidth = 920, maximumWidth = 600))
        assertEquals(0, contentColumnWidth(availableWidth = -1, maximumWidth = 600))
    }
}
