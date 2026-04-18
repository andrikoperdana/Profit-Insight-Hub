import { PropsWithChildren } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
