import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast"; 
import { signIn, signUp, confirmSignUp, checkAndClearExistingSession } from '@/lib/auth';

const Login = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const clearSession = async () => {
      if (!isSignUp) {
        await checkAndClearExistingSession();
      }
    };
    clearSession();
  }, [isSignUp]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
  
    try {
      if (isConfirming) {
        await confirmSignUp(email, confirmationCode);
        toast({
          title: "Success",
          description: "Account confirmed! Please sign in.",
        });
        setIsConfirming(false);
        setIsSignUp(false);
      } else if (isSignUp) {
        if (!name) {
          toast({
            title: "Error",
            description: "Name is required for signup",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
  
        const formattedPhoneNumber = phoneNumber.startsWith('+')
          ? phoneNumber
          : `+1${phoneNumber.replace(/\D/g, '')}`;
  
        try {
          await signUp(email, password, formattedPhoneNumber, name);
          toast({
            title: "Success",
            description: "Please enter the verification code sent to your email",
          });
          setIsConfirming(true);
        } catch (signUpError) {
          if (signUpError.message.includes('already exists')) {
            toast({
              title: "Error",
              description: "An account with this email already exists",
              variant: "destructive",
            });
          } else {
            throw signUpError;
          }
        }
      } else {
        const result = await signIn(email, password);
        if (result) {
          onLogin();
          toast({
            title: "Welcome back!",
            description: "Successfully logged in",
          });
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    if (isConfirming) {
      return (
        <>
          <div className="space-y-2">
            <Label htmlFor="confirmationCode">Confirmation Code</Label>
            <Input
              id="confirmationCode"
              type="text"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              required
            />
            <div className="text-sm text-gray-500">
              Enter the verification code sent to your email
            </div>
          </div>
          <Button 
            type="submit" 
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Confirming...' : 'Confirm Account'}
          </Button>
        </>
      );
    }

    return (
      <>
        {isSignUp && (
          <div className="space-y-2">
            <Label htmlFor="name">First name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {isSignUp && (
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              type="tel"
              placeholder="+1XXXXXXXXXX"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
            <div className="text-sm text-gray-500">
              Format: +1XXXXXXXXXX (include country code)
            </div>
          </div>
        )}
        <Button 
          type="submit" 
          className="w-full"
          disabled={loading}
        >
          {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
        </Button>
      </>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {isConfirming ? 'Confirm Account' : (isSignUp ? 'Create Account' : 'Sign In')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {renderForm()}
          </form>
          {!isConfirming && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setPhoneNumber('');
                  setConfirmationCode('');
                }}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
