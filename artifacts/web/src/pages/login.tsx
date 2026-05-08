import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login: setAuth, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) setLocation("/");
  }, [isAuthenticated, setLocation]);
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuth(data.token, data.user);
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: error?.message || "Please check your credentials and try again.",
        });
      },
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate({ data });
  };

  const seedUsers = [
    { email: "management@secureprofit.id", role: "PMO Director" },
    { email: "pm@secureprofit.id", role: "Project Manager" },
    { email: "sales@secureprofit.id", role: "Sales" },
    { email: "konsultan@secureprofit.id", role: "Consultant" },
    { email: "writer@secureprofit.id", role: "Technical Writer" },
    { email: "admin@secureprofit.id", role: "Admin Project" },
    { email: "principal.kon.h7q4@itsecasia.com", role: "Principal Consultant" },
    { email: "principal.tw.m9k2@itsecasia.com", role: "Principal Technical Writer" },
    { email: "principal.ap.r3n8@itsecasia.com", role: "Principal Admin Project" },
    { email: "siteadmin@secureprofit.id", role: "Site Admin" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Cyberpunk grid background effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
      
      <div className="z-10 w-full max-w-md space-y-8">
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="bg-primary/10 p-4 rounded-full border border-primary/20 mb-4 shadow-[0_0_15px_rgba(22,163,74,0.3)]">
            <Shield className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">SecureProfit Hub</h1>
          <p className="text-muted-foreground text-sm">Security operations & margins console</p>
        </div>

        <Card className="border-border/50 shadow-xl bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>System Access</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="user@secureprofit.id" {...field} className="bg-background" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} className="bg-background" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full font-bold shadow-[0_0_10px_rgba(22,163,74,0.4)]" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Authenticating..." : "Initialize Session"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="border-border/30 bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Test Credentials (password123)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-xs">
            {seedUsers.map((u) => (
              <div 
                key={u.email} 
                className="p-2 rounded border border-border/50 bg-background/50 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => {
                  form.setValue("email", u.email);
                  form.setValue("password", "password123");
                }}
              >
                <div className="font-semibold text-primary">{u.role}</div>
                <div className="text-muted-foreground truncate" title={u.email}>{u.email}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
