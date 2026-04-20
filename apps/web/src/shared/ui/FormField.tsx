import React from "react";

type FormFieldProps = {
  label: string;
  error?: string;
  children: React.ReactNode;
};

export const FormField: React.FC<FormFieldProps> = ({ label, error, children }) => (
  <div>
    <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
    {children}
    {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
  </div>
);

