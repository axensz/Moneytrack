import React from 'react';

/**
 * Labelled text field. 44px tall to clear the mobile touch floor; violet focus
 * ring matches every input in the product.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Muted field label rendered above the input */
  label?: string;
  /** Helper text rendered below in muted grey */
  hint?: string;
  /** Error message — turns the border red and replaces the hint */
  error?: string;
}

export function Input(props: InputProps): React.JSX.Element;

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Muted field label rendered above the select */
  label?: string;
  children?: React.ReactNode;
}

export function Select(props: SelectProps): React.JSX.Element;
