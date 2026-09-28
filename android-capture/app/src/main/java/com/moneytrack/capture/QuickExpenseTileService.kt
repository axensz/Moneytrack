package com.moneytrack.capture

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class QuickExpenseTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        qsTile?.apply {
            state = Tile.STATE_INACTIVE
            label = getString(R.string.quick_expense_tile_label)
            contentDescription = getString(R.string.quick_expense_tile_description)
            updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        val openForm = Runnable(::openQuickExpense)
        if (QuickExpenseTileBehavior.requiresUnlock(isSecure, isLocked)) {
            unlockAndRun(openForm)
        } else {
            openForm.run()
        }
    }

    @SuppressLint("NewApi", "StartActivityAndCollapseDeprecated")
    @Suppress("DEPRECATION")
    private fun openQuickExpense() {
        val intent = Intent(this, QuickExpenseActivity::class.java)
            .setAction(QUICK_EXPENSE_ACTION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

        if (QuickExpenseTileBehavior.usesPendingIntent(Build.VERSION.SDK_INT)) {
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            startActivityAndCollapse(pendingIntent)
        } else {
            startActivityAndCollapse(intent)
        }
    }

    private companion object {
        const val QUICK_EXPENSE_ACTION = "com.moneytrack.capture.action.QUICK_EXPENSE"
    }
}

internal object QuickExpenseTileBehavior {
    fun requiresUnlock(isSecure: Boolean, isLocked: Boolean): Boolean = isSecure && isLocked

    fun usesPendingIntent(apiLevel: Int): Boolean =
        apiLevel >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
}
